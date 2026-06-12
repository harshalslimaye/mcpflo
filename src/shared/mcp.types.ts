// Transport configurations supported by MCP
export type StdioTransportConfig = {
  type: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type SseTransportConfig = {
  type: 'sse'
  url: string
  headers?: Record<string, string>
}

export type StreamableHttpTransportConfig = {
  type: 'streamable-http'
  url: string
  headers?: Record<string, string>
}

export type TransportConfig =
  | StdioTransportConfig
  | SseTransportConfig
  | StreamableHttpTransportConfig

// Lifecycle status of a server connection
export type ServerStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

// MCP capability types — mirrors @modelcontextprotocol/sdk schema shapes
export interface ToolInputSchema {
  type: 'object'
  properties?: Record<string, object>
  required?: string[]
  [key: string]: unknown
}

// Optional behavioural hints a server may attach to a tool.
// Mirrors the MCP spec's ToolAnnotations shape; all fields are advisory.
export interface ToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface Tool {
  name: string
  description?: string
  inputSchema: ToolInputSchema
  annotations?: ToolAnnotations
}

export interface Resource {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export interface PromptArgument {
  name: string
  description?: string
  required?: boolean
}

export interface Prompt {
  name: string
  description?: string
  arguments?: PromptArgument[]
}

// Capabilities returned after a successful server connection
export interface ConnectResult {
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
}

// A single content block in a tool-call result (text, image, resource, …).
export interface ToolCallContent {
  type: string
  text?: string
  [key: string]: unknown
}

// Result of invoking a tool — mirrors the MCP SDK's CallToolResult shape.
export interface ToolCallResult {
  content?: ToolCallContent[]
  structuredContent?: unknown
  // True when the tool itself reported an error (protocol-level success).
  isError?: boolean
  [key: string]: unknown
}

// A notification frame received off the wire while a tool call is in flight
// (notifications/progress, notifications/message, …). `params` is the raw
// JSON-RPC params object, untouched — presentation decides how to render it.
export interface ToolCallNotification {
  method: string
  params?: Record<string, unknown>
  at: number
}

// Pushed from main to renderer over the `mcp:toolNotification` channel.
// `callId` ties the notification back to the invocation that produced it.
export interface ToolCallNotificationEvent {
  callId: string
  notification: ToolCallNotification
}

// Outcome of a tool invocation as surfaced to the renderer.
//
// `response` is the full JSON-RPC response envelope captured off the wire
// ({ jsonrpc, id, result } or { jsonrpc, id, error }). It's undefined only when
// the call failed before any response arrived (e.g. a connection error), in
// which case `error` carries the transport-level message.
export interface ToolCallOutcome {
  response?: unknown
  error?: string
}

// Capabilities persisted to disk (servers/<id>/capabilities.json) so they're
// available before fetching and across app restarts.
export interface CachedCapabilities {
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
  fetchedAt: number
}

// The persistable subset — stored on disk, no runtime state
export interface ServerConfig {
  id: string
  name: string
  description?: string
  transport: TransportConfig
}

// A configured MCP server and its discovered capabilities.
//
// `status` reflects capability-cache state, not a live socket:
//   disconnected (grey)  — no capabilities cached yet
//   connecting   (yellow)— fetching now
//   connected    (green) — capabilities cached & available
//   error        (red)   — last fetch failed
export interface MCPServer extends ServerConfig {
  status: ServerStatus
  error?: string
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
  // When capabilities were last fetched. Undefined = never fetched.
  fetchedAt?: number
}
