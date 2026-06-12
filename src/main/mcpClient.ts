import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  ElicitRequestSchema,
  type ElicitResult,
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
  ElicitationResult
} from '../shared/mcp.types'

// Answers an elicitation/create request from the server. `signal` aborts when
// the server cancels the request (e.g. its own elicitation timeout fires).
export type ElicitationHandler = (
  params: ElicitationParams,
  signal: AbortSignal
) => Promise<ElicitationResult>

export interface ConnectResult {
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
}

// Active clients keyed by server ID
const clients = new Map<string, Client>()

// Opens (or re-opens) a connection for a server and caches the client. Returns
// the transport too so callers can observe the raw JSON-RPC frames.
async function openClient(
  config: ServerConfig
): Promise<{ client: Client; transport: StdioClientTransport }> {
  if (config.transport.type !== 'stdio') {
    throw new Error(`Transport "${config.transport.type}" not yet supported`)
  }

  // Disconnect existing client for this server if any
  await disconnectServer(config.id)

  const transport = new StdioClientTransport({
    command: config.transport.command,
    args: config.transport.args,
    // Inherit only a safe baseline (PATH, HOME, …) rather than the full host
    // environment, so secrets in process.env never leak into spawned servers.
    // The user's explicitly configured env vars are layered on top.
    env: {
      ...getDefaultEnvironment(),
      ...config.transport.env
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
      // tasks/get, tasks/result and tasks/cancel from this store. Per-client and
      // in-memory — task state dies with the connection, which matches our
      // connect-per-call lifecycle.
      taskStore: new InMemoryTaskStore()
    }
  )
  await client.connect(transport)
  clients.set(config.id, client)
  return { client, transport }
}

export async function connectServer(config: ServerConfig): Promise<ConnectResult> {
  const { client } = await openClient(config)

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

function isResponseId(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
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

// Invokes a tool on a server. Connects on demand and disconnects afterwards —
// consistent with how we treat capability fetches (no long-lived process).
//
// The high-level SDK strips the JSON-RPC envelope and returns only the inner
// `result`. To expose the full wire response we tap the transport: capture the
// id of the outgoing `tools/call` request, then grab the response frame that
// carries that id (a `result` or a JSON-RPC `error`).
export async function callTool(
  config: ServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  onNotification?: (notification: ToolCallNotification) => void,
  onElicitation?: ElicitationHandler
): Promise<ToolCallOutcome> {
  let requestId: string | number | undefined
  let response: unknown

  try {
    const { client, transport } = await openClient(config)

    // Elicitation arrives as a server-to-client *request* (it carries an id),
    // so the onmessage tap below never records it — emit synthetic
    // notifications around the exchange to make it visible in call history.
    client.setRequestHandler(ElicitRequestSchema, async (request, extra) => {
      if (!onElicitation) return { action: 'decline' } satisfies ElicitResult
      // URL-mode requests never reach here: we advertise form-only support,
      // so the SDK rejects them with InvalidParams before invoking handlers.
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

      // Task-augmented elicitation: acknowledge with a task immediately, run
      // the user interaction in the background, and let the server poll
      // tasks/get / tasks/result (served by the SDK from our task store).
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
          // The task may have gone terminal under us (e.g. tasks/cancel from
          // the server); a late result is simply dropped.
          .catch(() => {})
        return { task: { ...task, status: 'input_required' } }
      }

      // Our content type is looser than the SDK's (the renderer's raw-JSON
      // fallback can produce arbitrary values); the SDK validates on send.
      return (await runElicitation()) as ElicitResult
    })

    const originalSend = transport.send.bind(transport)
    transport.send = (message) => {
      const msg = message as Record<string, unknown>
      if (msg && msg.method === 'tools/call' && isResponseId(msg.id)) {
        requestId = msg.id
      }
      return originalSend(message)
    }

    const originalOnMessage = transport.onmessage
    transport.onmessage = (message) => {
      const msg = message as Record<string, unknown>
      if (msg && msg.id === requestId && ('result' in msg || 'error' in msg)) {
        response = msg
      }
      // Notification frames carry a method but no id (server-to-client
      // *requests*, e.g. sampling, carry an id and are not notifications).
      // Frames arriving before the tools/call request goes out are connection
      // handshake traffic, not call output.
      if (
        msg &&
        typeof msg.method === 'string' &&
        !('id' in msg) &&
        requestId !== undefined &&
        !IGNORED_NOTIFICATION_METHODS.has(msg.method)
      ) {
        onNotification?.({
          method: msg.method,
          params:
            msg.params !== null && typeof msg.params === 'object'
              ? (msg.params as Record<string, unknown>)
              : undefined,
          at: Date.now()
        })
      }
      originalOnMessage?.(message)
    }

    // The no-op onprogress makes the SDK attach `_meta.progressToken` to the
    // request — servers only emit notifications/progress when a token is
    // present. The frames themselves are captured by the onmessage tap above.
    // The long timeout keeps the call alive while the user fills in an
    // elicitation form (the SDK default of 60s would kill it under them).
    await client.callTool({ name: toolName, arguments: args }, undefined, {
      onprogress: () => {},
      timeout: 30 * 60_000,
      resetTimeoutOnProgress: true
    })
    return { response }
  } catch (err) {
    // A JSON-RPC error still arrives as a response frame (captured above); only
    // a pre-response failure (e.g. spawn/connection error) has no envelope.
    if (response !== undefined) return { response }
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    await disconnectServer(config.id)
  }
}

// Fetches a snapshot of a server's capabilities, then disconnects — we don't
// keep the process alive just to browse cached capabilities. Tool calling (a
// later feature) will reconnect on demand.
export async function fetchCapabilities(config: ServerConfig): Promise<ConnectResult> {
  try {
    return await connectServer(config)
  } finally {
    await disconnectServer(config.id)
  }
}

export async function disconnectServer(id: string): Promise<void> {
  const client = clients.get(id)
  if (client) {
    await client.close().catch(() => {})
    clients.delete(id)
  }
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...clients.keys()].map(disconnectServer))
}
