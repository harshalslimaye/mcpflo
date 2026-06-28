import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type {
  ToolCallNotification,
  ElicitationParams,
  ElicitationResult,
  SamplingParams,
  SamplingResult
} from '../../shared/mcp.types'

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

// The context of the single in-flight tool call on a session. Calls are
// serialized per server, so there is at most one of these at a time — which
// keeps response capture, notification forwarding and elicitation routing
// unambiguous without tagging every frame with a call id.
export interface ActiveCall {
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
export interface Session {
  client: Client
  transport: Transport
  active: ActiveCall | null
  // Tail of the per-server serialization chain; each call awaits the previous.
  queue: Promise<unknown>
}
