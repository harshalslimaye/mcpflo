import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
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
import type {
  ServerConfig,
  Tool,
  Resource,
  Prompt,
  ToolCallOutcome,
  ToolCallNotification,
  ElicitationParams,
  ElicitationResult,
  SamplingParams,
  SamplingResult
} from '../shared/mcp.types'

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
  transport: StdioClientTransport
  active: ActiveCall | null
  // Tail of the per-server serialization chain; each call awaits the previous.
  queue: Promise<unknown>
}

// Live sessions keyed by server ID. The value is the connection *promise*, not
// the resolved session, so concurrent first-callers share one spawn instead of
// racing to create duplicate processes.
const sessions = new Map<string, Promise<Session>>()

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
  if (config.transport.type !== 'stdio') {
    return Promise.reject(new Error(`Transport "${config.transport.type}" not yet supported`))
  }

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

async function createSession(config: ServerConfig): Promise<Session> {
  const stdio = config.transport as Extract<ServerConfig['transport'], { type: 'stdio' }>
  const transport = new StdioClientTransport({
    command: stdio.command,
    args: stdio.args,
    // Inherit only a safe baseline (PATH, HOME, …) rather than the full host
    // environment, so secrets in process.env never leak into spawned servers.
    // The user's explicitly configured env vars are layered on top.
    env: {
      ...getDefaultEnvironment(),
      ...stdio.env
    }
  })

  const client = new Client(
    { name: 'mcpflo', version: '1.0.0' },
    {
      capabilities: {
        sampling: {},
        elicitation: {},
        roots: { listChanged: true },
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
  await client.connect(transport)

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
  'notifications/prompts/list_changed'
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
  onSampling?: SamplingHandler
): Promise<ToolCallOutcome> {
  let session: Session
  try {
    session = await getSession(config)
  } catch (err) {
    // A pre-response failure (e.g. spawn/connection error, unsupported
    // transport) never produced a JSON-RPC envelope.
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const run = session.queue.then(() =>
    runToolCall(session, toolName, args, onNotification, onElicitation, onSampling)
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
  session: Session,
  toolName: string,
  args: Record<string, unknown>,
  onNotification?: (notification: ToolCallNotification) => void,
  onElicitation?: ElicitationHandler,
  onSampling?: SamplingHandler
): Promise<ToolCallOutcome> {
  const call: ActiveCall = { onNotification, onElicitation, onSampling }
  session.active = call
  try {
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
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    session.active = null
  }
}

// Fetches a snapshot of a server's capabilities, warming the connection so the
// first tool call on it is instant.
export async function fetchCapabilities(config: ServerConfig): Promise<ConnectResult> {
  return connectServer(config)
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
