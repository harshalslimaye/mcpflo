import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
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
import type {
  ElicitationParams,
  ElicitationResult,
  SamplingParams,
  SamplingResult
} from '../../shared/mcp.types'
import type { Session } from './types'

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
  'notifications/prompts/list_changed',
  // Task status arrives both as a wire notification (seen by the tap) and as a
  // stream frame the SDK derives from it. The task path emits its own synthetic
  // `tasks/status` from the stream, so drop the wire copy to avoid duplicates.
  'notifications/tasks/status'
])

// Registers the elicitation/sampling request handlers and taps the transport,
// once for the connection's lifetime (not per call). Both the handlers and the
// tap read whatever call is currently `session.active`, which keeps response
// capture, notification forwarding and elicitation/sampling routing
// unambiguous without tagging every frame with a call id.
export function wireSession(client: Client, transport: Transport, session: Session): void {
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
}
