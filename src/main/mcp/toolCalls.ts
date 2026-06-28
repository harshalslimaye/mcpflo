import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  ServerConfig,
  TaskSupport,
  ToolCallOutcome,
  ToolCallNotification
} from '../../shared/mcp.types'
import type { ActiveCall, ElicitationHandler, SamplingHandler, Session } from './types'
import { getSession, handleOperationAuthError } from './session'

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
