import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  ElicitRequestSchema,
  CreateMessageRequestSchema,
  McpError,
  ErrorCode,
  type ElicitResult,
  type CreateMessageResult,
  type Result
} from '@modelcontextprotocol/sdk/types.js'
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type {
  ServerConfig,
  Tool,
  TaskSupport,
  Resource,
  Prompt,
  ToolCallOutcome,
  ResourceReadOutcome,
  PromptGetOutcome,
  ToolCallNotification,
  ElicitationParams,
  ElicitationResult,
  SamplingParams,
  SamplingResult,
  AuthEvent
} from '../shared/mcp.types'
import { isSecretStorageAvailable } from './secrets'
import {
  readOAuthState,
  saveRedirectPort,
  clearClientInformation,
  EncryptionUnavailableError
} from './oauthStore'
import { createOAuthProvider, startLoopbackListener, type LoopbackListener } from './oauthProvider'
import { resolveShellPath } from './shellPath'
import { credentialOverHttp } from '../shared/transportSafety'

// Answers an elicitation/create request from the server. `signal` aborts when
// the server cancels the request (e.g. its own elicitation timeout fires).
export type ElicitationHandler = (
  params: ElicitationParams,
  signal: AbortSignal
) => Promise<ElicitationResult>

// Answers a sampling/createMessage request from the server. `signal` aborts
// when the server cancels the request (e.g. its own timeout fires).
export type SamplingHandler = (
  params: SamplingParams,
  signal: AbortSignal
) => Promise<SamplingResult>

export interface ConnectResult {
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
  // Set (with empty listings) when the connect couldn't proceed because the
  // server needs (re-)authorization — see the shared ConnectResult for details.
  authRequired?: boolean
}

// Thrown by the OAuth handshake when the server doesn't support Dynamic Client
// Registration and no manual Client ID is configured — registration is then the
// only route to credentials, so there's nothing to retry without one. Distinct
// from the SDK's UnauthorizedError so fetchCapabilities can translate it into a
// benign authRequired outcome (the dcr_required auth event, emitted alongside,
// drives the recovery modal).
class DcrRegistrationRequiredError extends Error {
  constructor() {
    super('Dynamic client registration is not supported by this server')
    this.name = 'DcrRegistrationRequiredError'
  }
}

// The context of the single in-flight tool call on a session. Calls are
// serialized per server, so there is at most one of these at a time — which
// keeps response capture, notification forwarding and elicitation routing
// unambiguous without tagging every frame with a call id.
interface ActiveCall {
  // Id of this call's `tools/call` request, learned when it's sent.
  requestId?: string | number
  // The raw JSON-RPC envelope carrying that id (a `result` or `error`).
  response?: unknown
  onNotification?: (notification: ToolCallNotification) => void
  onElicitation?: ElicitationHandler
  onSampling?: SamplingHandler
}

// A live, pooled connection to one MCP server. Spawned on first use and kept
// warm so later tool calls skip the ~seconds of spawn + handshake cost. The
// transport taps and elicitation handler are installed once here (not per
// call) and read whatever call is currently `active`.
interface Session {
  client: Client
  transport: Transport
  active: ActiveCall | null
  // Tail of the per-server serialization chain; each call awaits the previous.
  queue: Promise<unknown>
}

// Live sessions keyed by server ID. The value is the connection *promise*, not
// the resolved session, so concurrent first-callers share one spawn instead of
// racing to create duplicate processes.
const sessions = new Map<string, Promise<Session>>()

// OAuth flow progress is broadcast over a module-level emitter rather than the
// per-call `active` slot used by elicitation/sampling: auth events aren't tied
// to any tool call. ipc.ts subscribes via `onAuthEvent` and forwards to the
// renderer (with a sender-lifecycle guard) over the `mcp:authEvent` channel.
const authEmitter = new EventEmitter()

function emitAuth(event: AuthEvent): void {
  authEmitter.emit('event', event)
}

export function onAuthEvent(listener: (event: AuthEvent) => void): () => void {
  authEmitter.on('event', listener)
  return () => authEmitter.off('event', listener)
}

function isResponseId(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
}

// Resolves a map entry to its session, treating a failed connection as absent.
async function resolveSession(entry: Promise<Session> | undefined): Promise<Session | null> {
  if (!entry) return null
  return entry.catch(() => null)
}

// Returns the warm session for a server, spawning and wiring one on first use.
// Subsequent calls reuse the same process until it dies or is disconnected.
function getSession(config: ServerConfig): Promise<Session> {
  const existing = sessions.get(config.id)
  if (existing) return existing

  const pending = createSession(config)
  sessions.set(config.id, pending)
  // A failed connection must not stay cached, or every later call would reuse
  // the rejected promise instead of retrying the spawn.
  pending.catch(() => {
    if (sessions.get(config.id) === pending) sessions.delete(config.id)
  })
  return pending
}

// Builds the SDK transport for a server's configured transport type. Only this
// construction is transport-specific — everything downstream (client, taps,
// handlers) works against the generic Transport interface.
function createTransport(config: ServerConfig): Transport {
  const t = config.transport
  switch (t.type) {
    case 'stdio': {
      // Inherit only a safe baseline (PATH, HOME, …) rather than the full host
      // environment, so secrets in process.env never leak into spawned servers.
      // Override PATH with the login-shell value so binaries like npx resolve,
      // then layer the user's explicitly configured env vars on top (so a
      // user-set PATH still wins).
      const env: Record<string, string> = { ...getDefaultEnvironment() }
      const shellPath = resolveShellPath()
      if (shellPath) env.PATH = shellPath
      return new StdioClientTransport({
        command: t.command,
        args: t.args,
        env: { ...env, ...t.env }
      })
    }
    case 'streamable-http': {
      // requestInit.headers applies to every request (POST + the fetch-based GET
      // stream), so an Authorization header covers token-authed servers.
      const url = new URL(t.url)
      // Enforce the cleartext-credential guardrail here, not only in the UI, so a
      // config that bypassed the form (hand-edited config.json, a future import)
      // can't leak a credential header over plain http to a non-loopback host.
      assertCredentialSafe(url, t.headers)
      return new StreamableHTTPClientTransport(
        url,
        t.headers ? { requestInit: { headers: t.headers } } : undefined
      )
    }
  }
}

// Refuses to build a transport that would send a credential header in cleartext
// over non-loopback http. Throws (failing the connect) rather than silently
// stripping the header — a misconfigured-but-secret-bearing server should surface
// loudly, not connect unauthenticated.
function assertCredentialSafe(url: URL, headers?: Record<string, string>): void {
  if (!headers) return
  const unsafe = credentialOverHttp(url, Object.keys(headers))
  if (unsafe) throw new Error(unsafe)
}

// Builds the OAuth-mode streamable-http transport. Binds the loopback listener
// up front (the bound port goes into the redirect_uri), reusing the persisted
// port so the DCR-registered redirect_uri stays stable across restarts; a fresh
// ephemeral port (stale persisted port taken) is written back. The returned
// `loopback` is awaited only if connect throws UnauthorizedError.
async function buildOAuthTransport(
  config: ServerConfig
): Promise<{ transport: StreamableHTTPClientTransport; loopback: LoopbackListener }> {
  const t = config.transport
  if (t.type !== 'streamable-http') {
    throw new Error('OAuth is only supported on streamable-http transports')
  }
  // No silent in-memory fallback: OAuth tokens must be encryptable at rest.
  if (!isSecretStorageAvailable()) throw new EncryptionUnavailableError()

  const url = new URL(t.url)
  // Static headers still ride alongside OAuth (Authorization is blocked in the UI,
  // so it can't collide with the bearer token the provider injects) — but they're
  // subject to the same cleartext-credential guardrail as a plain http transport.
  assertCredentialSafe(url, t.headers)

  const saved = await readOAuthState(config.id)
  const oauthState = randomUUID()
  const loopback = await startLoopbackListener(oauthState, saved?.redirect_port)
  if (loopback.port !== saved?.redirect_port) {
    await saveRedirectPort(config.id, loopback.port)
    // The persisted port was taken and the listener fell back to a fresh one, so
    // the redirect_uri just changed. A prior DCR registration still carries the
    // old port's redirect_uri and the auth server would reject the mismatch —
    // drop that registration so the SDK re-registers against the new redirect_uri.
    // Manual clientId configs have no DCR registration to invalidate.
    if (saved?.client_information && !t.oauth?.clientId) {
      await clearClientInformation(config.id)
    }
  }

  const redirectUrl = `http://127.0.0.1:${loopback.port}/callback`
  const provider = createOAuthProvider(config.id, t.oauth ?? {}, redirectUrl, oauthState)
  const transport = new StreamableHTTPClientTransport(url, {
    authProvider: provider,
    requestInit: { headers: t.headers ?? {} }
  })
  return { transport, loopback }
}

// Drives the 401 → browser → finishAuth → retry handshake around connect. On the
// token-valid path no browser opens: connect succeeds and the listener is torn
// down without ever being awaited.
async function authorizeAndConnect(
  config: ServerConfig,
  client: Client,
  transport: StreamableHTTPClientTransport,
  loopback: LoopbackListener
): Promise<void> {
  const serverId = config.id
  const timeout = config.overrides?.timeoutMs
  try {
    await client.connect(transport, { timeout })
    loopback.close()
    emitAuth({ type: 'success', serverId })
    return
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      loopback.close()
      // DCR failures throw a typed error so fetchCapabilities can present them as
      // an authRequired outcome rather than a hard connect error; everything else
      // propagates raw.
      if (await emitConnectFailure(config, err)) throw new DcrRegistrationRequiredError()
      throw err
    }
  }

  // 401: the SDK already opened the browser via redirectToAuthorization during
  // the failed connect. Wait for the loopback redirect, exchange the code, retry.
  emitAuth({ type: 'pending', serverId })
  let code: string
  try {
    ;({ code } = await loopback.result)
  } catch (err) {
    emitAuth({ type: 'error', serverId, reason: err instanceof Error ? err.message : String(err) })
    throw err
  }
  await transport.finishAuth(code)
  try {
    await client.connect(transport, { timeout })
  } catch (err) {
    emitAuth({ type: 'error', serverId, reason: 'Auth failed after code exchange' })
    throw err
  }
  emitAuth({ type: 'success', serverId })
}

// Connectivity errno codes (offline, DNS, refused, TLS handshake) raised by
// fetch/undici. A connect failure carrying one of these never reached the point
// of attempting registration, so it must not be misread as a DCR failure.
const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
])

// True when a connect failure is a transport/connectivity problem rather than a
// server-side auth outcome. Walks the error's `cause` chain (fetch wraps the
// real socket error) checking both the errno code and the message, so a
// retryable network error is never mistaken for "registration unsupported".
function isNetworkError(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code
    if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true
    if (
      /fetch failed|network|getaddrinfo|socket hang up|timed out|tls|certificate/i.test(e.message)
    )
      return true
  }
  return false
}

// Classifies a non-UnauthorizedError connect failure and emits the matching auth
// event. DCR is the only route to credentials when there's no configured clientId
// and nothing registered yet — so a failure under those preconditions is treated
// as "registration unsupported" (emit dcr_required, return true so the caller
// throws the typed DCR error and the recovery modal opens) *unless* it's a
// recognizable network error, which is retryable and surfaces its raw message.
async function emitConnectFailure(config: ServerConfig, err: unknown): Promise<boolean> {
  const t = config.transport
  const reason = err instanceof Error ? err.message : String(err)
  const hasClientId = t.type === 'streamable-http' && !!t.oauth?.clientId
  if (!hasClientId && !isNetworkError(err)) {
    const saved = await readOAuthState(config.id)
    if (!saved?.client_information) {
      emitAuth({ type: 'dcr_required', serverId: config.id })
      return true
    }
  }
  emitAuth({ type: 'error', serverId: config.id, reason })
  return false
}

// Triggers (or re-triggers) the OAuth flow by establishing the server's session.
// Re-auth relies on the stale session having been dropped first (clearAuth and
// the operation-path auth handler both do this), so concurrency stays bounded by
// the sessions map: getSession shares one in-flight connect per server.
export async function authorizeServer(config: ServerConfig): Promise<void> {
  try {
    await getSession(config)
  } catch (err) {
    // A DCR failure already emitted dcr_required, which opens the recovery modal —
    // that's the handled outcome, not a flow error. Swallow it so the IPC handler
    // doesn't log a raw rejection and the renderer doesn't show a redundant toast
    // on top of the modal. Every other failure path emits its own auth 'error'
    // event and is re-thrown for the renderer's safety-net catch.
    if (err instanceof DcrRegistrationRequiredError) return
    throw err
  }
}

// Tears down a session left unusable by an UnauthorizedError mid-operation and
// flips the renderer into auth_required so the re-auth affordance appears.
function handleOperationAuthError(serverId: string): void {
  void disconnectServer(serverId)
  emitAuth({ type: 'auth_required', serverId })
}

async function createSession(config: ServerConfig): Promise<Session> {
  const client = new Client(
    { name: 'mcpflo', version: '1.0.0' },
    {
      capabilities: {
        sampling: {},
        elicitation: {},
        // roots intentionally not advertised in v1 — MCPFlo has no UI to
        // configure them yet, so claiming support would leave servers calling
        // roots/list and getting an empty list. Revisit in v2.
        tasks: {
          requests: {
            sampling: { createMessage: {} },
            elicitation: { create: {} }
          }
        }
      },
      // Backs task-augmented requests (e.g. async elicitation): the SDK serves
      // tasks/get, tasks/result and tasks/cancel from this store. Per-session
      // and in-memory — task state lives as long as the connection does.
      taskStore: new InMemoryTaskStore()
    }
  )

  // OAuth-mode streamable-http routes through the auth-aware handshake; every
  // other transport connects directly. createTransport stays synchronous — only
  // the OAuth branch needs async setup (loopback bind).
  const t = config.transport
  let transport: Transport
  if (t.type === 'streamable-http' && t.auth === 'oauth') {
    const built = await buildOAuthTransport(config)
    transport = built.transport
    await authorizeAndConnect(config, client, built.transport, built.loopback)
  } else {
    transport = createTransport(config)
    await client.connect(transport, { timeout: config.overrides?.timeoutMs })
  }

  const session: Session = { client, transport, active: null, queue: Promise.resolve() }

  // When the process dies, drop the session so the next call respawns a fresh
  // one instead of reusing a dead handle.
  client.onclose = (): void => {
    const entry = sessions.get(config.id)
    void resolveSession(entry).then((resolved) => {
      if (resolved === session && sessions.get(config.id) === entry) sessions.delete(config.id)
    })
  }

  // Elicitation arrives as a server-to-client *request* (it carries an id), so
  // the onmessage tap below never sees it — route it to the in-flight call's
  // handler and bracket the exchange with synthetic notifications so it shows
  // up in call history.
  client.setRequestHandler(ElicitRequestSchema, async (request, extra) => {
    const onElicitation = session.active?.onElicitation
    const onNotification = session.active?.onNotification
    if (!onElicitation) return { action: 'decline' } satisfies ElicitResult
    // URL-mode requests never reach here: we advertise form-only support, so
    // the SDK rejects them with InvalidParams before invoking handlers.
    const params = request.params as ElicitationParams

    const runElicitation = async (): Promise<ElicitationResult> => {
      onNotification?.({ method: 'elicitation/create', params, at: Date.now() })
      const result = await onElicitation(params, extra.signal)
      onNotification?.({
        method: 'elicitation/response',
        params: result as unknown as Record<string, unknown>,
        at: Date.now()
      })
      return result
    }

    // Task-augmented elicitation: acknowledge with a task immediately, run the
    // user interaction in the background, and let the server poll tasks/get /
    // tasks/result (served by the SDK from our task store).
    const { taskStore } = extra
    if (request.params.task && taskStore) {
      const task = await taskStore.createTask({ ttl: extra.taskRequestedTtl ?? null })
      await taskStore.updateTaskStatus(task.taskId, 'input_required')
      void runElicitation()
        .then(
          (result) =>
            taskStore.storeTaskResult(task.taskId, 'completed', result as unknown as Result),
          (err: unknown) =>
            taskStore.storeTaskResult(task.taskId, 'failed', {
              action: 'cancel',
              _meta: { error: err instanceof Error ? err.message : String(err) }
            })
        )
        // The task may have gone terminal under us (e.g. tasks/cancel from the
        // server); a late result is simply dropped.
        .catch(() => {})
      return { task: { ...task, status: 'input_required' } }
    }

    // Our content type is looser than the SDK's (the renderer's raw-JSON
    // fallback can produce arbitrary values); the SDK validates on send.
    return (await runElicitation()) as ElicitResult
  })

  // Sampling arrives as a server-to-client *request* too (it asks us to run an
  // LLM completion). MCPFlo answers it by hand rather than calling a model, so
  // we route it to the in-flight call's handler exactly like elicitation, and
  // bracket the exchange with synthetic notifications for call history.
  client.setRequestHandler(CreateMessageRequestSchema, async (request, extra) => {
    const onSampling = session.active?.onSampling
    const onNotification = session.active?.onNotification
    // Declining a sampling request has no result shape (CreateMessageResult has
    // no "action"), so refusal is signalled as a JSON-RPC error.
    if (!onSampling) {
      throw new McpError(ErrorCode.MethodNotFound, 'No sampling handler available')
    }
    const params = request.params as SamplingParams

    const runSampling = async (): Promise<SamplingResult> => {
      onNotification?.({
        method: 'sampling/create',
        params: params as unknown as Record<string, unknown>,
        at: Date.now()
      })
      const result = await onSampling(params, extra.signal)
      onNotification?.({
        method: 'sampling/response',
        params: result as unknown as Record<string, unknown>,
        at: Date.now()
      })
      return result
    }

    // A non-accept outcome (decline/cancel) has no result shape, so it's
    // reported as a JSON-RPC error / failed task with this message.
    const refusedMessage = (result: SamplingResult): string =>
      `Sampling ${result.action === 'cancel' ? 'cancelled' : 'declined'} by user`

    // The user's accept carries the assistant turn; decline/cancel become an
    // error back to the server. The SDK validates the result shape on send.
    const toCreateMessageResult = (result: SamplingResult): CreateMessageResult => {
      if (result.action !== 'accept') {
        throw new McpError(ErrorCode.InvalidRequest, refusedMessage(result))
      }
      return {
        role: 'assistant',
        content: result.content ?? { type: 'text', text: '' },
        model: result.model ?? 'mcpflo-manual',
        ...(result.stopReason ? { stopReason: result.stopReason } : {})
      } as CreateMessageResult
    }

    // Task-augmented sampling: acknowledge with a task immediately, run the user
    // interaction in the background, and let the server poll tasks/get /
    // tasks/result (served by the SDK from our task store).
    const { taskStore } = extra
    if (request.params.task && taskStore) {
      const task = await taskStore.createTask({ ttl: extra.taskRequestedTtl ?? null })
      await taskStore.updateTaskStatus(task.taskId, 'input_required')
      void runSampling()
        .then(
          (result) =>
            result.action === 'accept'
              ? taskStore.storeTaskResult(
                  task.taskId,
                  'completed',
                  toCreateMessageResult(result) as unknown as Result
                )
              : taskStore.storeTaskResult(task.taskId, 'failed', {
                  _meta: { error: refusedMessage(result) }
                }),
          (err: unknown) =>
            taskStore.storeTaskResult(task.taskId, 'failed', {
              _meta: { error: err instanceof Error ? err.message : String(err) }
            })
        )
        // The task may have gone terminal under us (e.g. tasks/cancel from the
        // server); a late result is simply dropped.
        .catch(() => {})
      return { task: { ...task, status: 'input_required' } }
    }

    return toCreateMessageResult(await runSampling())
  })

  // Tap the transport once for the connection's lifetime. The high-level SDK
  // strips the JSON-RPC envelope and returns only the inner `result`; to expose
  // the full wire response we capture the id of the outgoing `tools/call`, then
  // grab the response frame that carries it. Everything is keyed off the
  // current `active` call.
  const originalSend = transport.send.bind(transport)
  transport.send = (message) => {
    const msg = message as Record<string, unknown>
    if (session.active && msg && msg.method === 'tools/call' && isResponseId(msg.id)) {
      session.active.requestId = msg.id
    }
    return originalSend(message)
  }

  const originalOnMessage = transport.onmessage
  transport.onmessage = (message) => {
    const call = session.active
    const msg = message as Record<string, unknown>
    if (call) {
      if (msg && msg.id === call.requestId && ('result' in msg || 'error' in msg)) {
        call.response = msg
      }
      // Notification frames carry a method but no id (server-to-client
      // *requests*, e.g. sampling, carry an id and are not notifications).
      // Frames arriving before this call's `tools/call` request goes out are
      // connection handshake traffic, not call output.
      if (
        msg &&
        typeof msg.method === 'string' &&
        !('id' in msg) &&
        call.requestId !== undefined &&
        !IGNORED_NOTIFICATION_METHODS.has(msg.method)
      ) {
        call.onNotification?.({
          method: msg.method,
          params:
            msg.params !== null && typeof msg.params === 'object'
              ? (msg.params as Record<string, unknown>)
              : undefined,
          at: Date.now()
        })
      }
    }
    originalOnMessage?.(message)
  }

  return session
}

export async function connectServer(config: ServerConfig): Promise<ConnectResult> {
  const { client } = await getSession(config)

  const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
    client.listTools().catch(() => ({ tools: [] })),
    client.listResources().catch(() => ({ resources: [] })),
    client.listPrompts().catch(() => ({ prompts: [] }))
  ])

  return {
    tools: toolsResult.tools as Tool[],
    resources: resourcesResult.resources as Resource[],
    prompts: promptsResult.prompts as Prompt[]
  }
}

// Protocol housekeeping the server may emit at any moment (e.g. while
// registering capability-gated tools right after the handshake). These are
// capability-cache invalidation hints, never the output of a tool call, so
// they're excluded from the per-call notification stream.
const IGNORED_NOTIFICATION_METHODS = new Set([
  'notifications/tools/list_changed',
  'notifications/resources/list_changed',
  'notifications/prompts/list_changed',
  // Task status arrives both as a wire notification (seen by the tap) and as a
  // stream frame the SDK derives from it. The task path emits its own synthetic
  // `tasks/status` from the stream, so drop the wire copy to avoid duplicates.
  'notifications/tasks/status'
])

// Invokes a tool on a server over its warm, pooled connection (spawned on first
// use, reused after). Calls to the same server are serialized so the session's
// single `active` slot — which the transport taps and elicitation handler read
// — unambiguously belongs to this call. Calls to *different* servers run
// independently, so a long call on one never blocks another.
export async function callTool(
  config: ServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  onNotification?: (notification: ToolCallNotification) => void,
  onElicitation?: ElicitationHandler,
  onSampling?: SamplingHandler,
  taskSupport?: TaskSupport
): Promise<ToolCallOutcome> {
  let session: Session
  try {
    session = await getSession(config)
  } catch (err) {
    // The initial OAuth handshake failed (auth events were already emitted by
    // authorizeAndConnect); tell the renderer to show the re-auth affordance.
    if (err instanceof UnauthorizedError) return { authRequired: true }
    // A pre-response failure (e.g. spawn/connection error, unsupported
    // transport) never produced a JSON-RPC envelope.
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const run = session.queue.then(() =>
    runToolCall(
      config,
      session,
      toolName,
      args,
      onNotification,
      onElicitation,
      onSampling,
      taskSupport
    )
  )
  // Keep the serialization chain alive regardless of this call's outcome so a
  // failure here doesn't wedge later calls. `run` itself never rejects.
  session.queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function runToolCall(
  config: ServerConfig,
  session: Session,
  toolName: string,
  args: Record<string, unknown>,
  onNotification?: (notification: ToolCallNotification) => void,
  onElicitation?: ElicitationHandler,
  onSampling?: SamplingHandler,
  taskSupport?: TaskSupport
): Promise<ToolCallOutcome> {
  const call: ActiveCall = { onNotification, onElicitation, onSampling }
  // Set `active` for *both* paths: the transport tap, elicitation and sampling
  // handlers all key off it, so an in-task clarification still routes here.
  session.active = call
  try {
    // SEP-1686: a tool marked `required` rejects a plain tools/call and must be
    // invoked as a task. "optional" tools work as plain calls, so only
    // "required" takes the task path.
    if (taskSupport === 'required') {
      return await runTaskToolCall(session, toolName, args, onNotification)
    }
    // The no-op onprogress makes the SDK attach `_meta.progressToken` to the
    // request — servers only emit notifications/progress when a token is
    // present. The frames themselves are captured by the onmessage tap. The
    // long timeout keeps the call alive while the user fills in an elicitation
    // form (the SDK default of 60s would kill it under them).
    await session.client.callTool({ name: toolName, arguments: args }, undefined, {
      onprogress: () => {},
      timeout: 30 * 60_000,
      resetTimeoutOnProgress: true
    })
    return { response: call.response }
  } catch (err) {
    // A JSON-RPC error still arrives as a response frame (captured by the tap);
    // only a transport-level failure has no envelope.
    if (call.response !== undefined) return { response: call.response }
    // A token expired mid-session and refresh failed: drop the dead session and
    // flag re-auth rather than surfacing a raw transport error.
    if (err instanceof UnauthorizedError) {
      handleOperationAuthError(config.id)
      return { authRequired: true }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    session.active = null
  }
}

// Invokes a task-required (SEP-1686) tool via the experimental tasks API. The
// SDK drives the task lifecycle and yields a stream of frames; we surface each
// stage as a synthetic notification (so the Notifications tab lights up like it
// does for elicitation/sampling) and wrap the terminal result in a JSON-RPC
// envelope so the renderer parses it exactly like a plain call's response.
//
// Progress and side-channel server requests (elicitation/sampling that the tool
// raises mid-run) are not part of this stream — they flow through the transport
// tap and registered request handlers, which read `session.active`.
async function runTaskToolCall(
  session: Session,
  toolName: string,
  args: Record<string, unknown>,
  onNotification?: (notification: ToolCallNotification) => void
): Promise<ToolCallOutcome> {
  const stream = session.client.experimental.tasks.callToolStream(
    { name: toolName, arguments: args },
    undefined,
    // `task: {}` explicitly augments the request as a task. We already know this
    // tool is `required`, so we must not rely on the SDK's auto-detection
    // (`isToolTask`), which only returns true after `listTools()` has run on this
    // very client instance — a guarantee MCPFlo's pooled, disk-cached session
    // doesn't make. Without it the request goes out un-augmented and the server
    // rejects it ("requires task augmentation").
    { task: {}, onprogress: () => {}, timeout: 30 * 60_000, resetTimeoutOnProgress: true }
  )
  let response: unknown
  for await (const message of stream) {
    switch (message.type) {
      case 'taskCreated':
        onNotification?.({
          method: 'tasks/created',
          params: message.task as unknown as Record<string, unknown>,
          at: Date.now()
        })
        break
      case 'taskStatus':
        onNotification?.({
          method: 'tasks/status',
          params: message.task as unknown as Record<string, unknown>,
          at: Date.now()
        })
        break
      case 'result':
        // Wrap the inner CallToolResult in an envelope shape so it renders the
        // same as a plain call (the renderer reads `response.result`).
        response = { jsonrpc: '2.0', result: message.result }
        break
      case 'error':
        // A terminal protocol error (e.g. the tool failed the task). Surface it
        // as an error envelope so it renders like a JSON-RPC error frame.
        response = {
          jsonrpc: '2.0',
          error: {
            code: message.error.code,
            message: message.error.message,
            data: message.error.data
          }
        }
        break
    }
  }
  return { response }
}

// Reads a resource's contents over the server's warm, pooled connection. Unlike
// a tool call this needs none of the per-call machinery (no `active` slot, no
// transport tap, no serialization): resources/read is a single request →
// response with no progress/elicitation/sampling side channels. It can run
// concurrently with an in-flight tool call — the read's response carries its own
// id, so the tool call's tap never mistakes it for that call's output. The SDK
// returns only the inner result, so we wrap it in a JSON-RPC envelope to match
// the shape the renderer parses for tool calls (giving it a Raw view for free).
export async function readResource(
  config: ServerConfig,
  uri: string
): Promise<ResourceReadOutcome> {
  let session: Session
  try {
    session = await getSession(config)
  } catch (err) {
    if (err instanceof UnauthorizedError) return { authRequired: true }
    // A pre-response failure (spawn/connection error, unsupported transport)
    // never produced a JSON-RPC envelope.
    return { error: err instanceof Error ? err.message : String(err) }
  }

  try {
    const result = await session.client.readResource({ uri })
    return { response: { jsonrpc: '2.0', result } }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      handleOperationAuthError(config.id)
      return { authRequired: true }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// Gets a prompt's rendered messages over the server's warm, pooled connection.
// Like readResource this needs none of the per-call machinery: prompts/get is a
// single request → response with no progress/elicitation/sampling side channels,
// and its response carries its own id so it can run alongside an in-flight tool
// call. The SDK returns only the inner result, so we wrap it in a JSON-RPC
// envelope to match the shape the renderer parses for tool calls.
export async function getPrompt(
  config: ServerConfig,
  name: string,
  args: Record<string, string>
): Promise<PromptGetOutcome> {
  let session: Session
  try {
    session = await getSession(config)
  } catch (err) {
    if (err instanceof UnauthorizedError) return { authRequired: true }
    // A pre-response failure (spawn/connection error, unsupported transport)
    // never produced a JSON-RPC envelope.
    return { error: err instanceof Error ? err.message : String(err) }
  }

  try {
    const result = await session.client.getPrompt({ name, arguments: args })
    return { response: { jsonrpc: '2.0', result } }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      handleOperationAuthError(config.id)
      return { authRequired: true }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// Fetches a snapshot of a server's capabilities, warming the connection so the
// first tool call on it is instant.
export async function fetchCapabilities(config: ServerConfig): Promise<ConnectResult> {
  try {
    return await connectServer(config)
  } catch (err) {
    // Auth-required conditions aren't capability failures — the auth event has
    // already fired (UnauthorizedError below also drops the dead session; the DCR
    // path emitted dcr_required, which opens the recovery modal). Surface them as a
    // benign authRequired outcome so the renderer shows the sign-in affordance
    // instead of a red error, and the IPC handler doesn't log a raw rejection.
    if (err instanceof UnauthorizedError) {
      handleOperationAuthError(config.id)
      return { tools: [], resources: [], prompts: [], authRequired: true }
    }
    if (err instanceof DcrRegistrationRequiredError) {
      return { tools: [], resources: [], prompts: [], authRequired: true }
    }
    throw err
  }
}

export async function disconnectServer(id: string): Promise<void> {
  const entry = sessions.get(id)
  if (!entry) return
  // Delete first so the onclose hook (which also deletes) is a no-op and a
  // concurrent getSession can't hand back a closing connection.
  sessions.delete(id)
  const session = await resolveSession(entry)
  if (session) await session.client.close().catch(() => {})
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...sessions.keys()].map(disconnectServer))
}
