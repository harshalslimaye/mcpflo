// Transport configurations supported by MCP
export type StdioTransportConfig = {
  type: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

// OAuth 2.1 client credentials for a streamable-http server. All fields are
// optional: with none set, the client relies on Dynamic Client Registration
// (RFC 7591). `clientId`/`clientSecret` are the manual fallback when a server
// doesn't support DCR. Issued tokens never live here — they're persisted
// separately, encrypted, in servers/<id>/oauth.json.
export type OAuthConfig = {
  clientId?: string
  clientSecret?: string
  scope?: string
}

export type StreamableHttpTransportConfig = {
  type: 'streamable-http'
  url: string
  headers?: Record<string, string>
  // 'none' (default) = static headers / no auth. 'oauth' = authorization-code +
  // PKCE flow managed by the MCP SDK's auth provider.
  auth?: 'none' | 'oauth'
  oauth?: OAuthConfig
}

export type TransportConfig = StdioTransportConfig | StreamableHttpTransportConfig

// Lifecycle status of a server connection
export type ServerStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

// OAuth sign-in state for a server, tracked separately from `ServerStatus`:
// `status` is the capability-cache lifecycle, this is the token lifecycle.
// Absent on a server object = not an OAuth server.
//   idle           — OAuth configured, not signed in yet
//   authenticating — browser flow in progress
//   authenticated  — valid tokens held
//   auth_required  — tokens missing/expired/rejected; re-auth needed
export type ServerAuthState =
  | { status: 'idle' }
  | { status: 'authenticating' }
  | { status: 'authenticated' }
  | { status: 'auth_required'; reason?: string }

// Pushed from main to renderer over the `mcp:authEvent` channel as an OAuth flow
// progresses. Drives the server's `auth` field; never touches `status`.
export type AuthEvent =
  | { type: 'pending'; serverId: string }
  | { type: 'success'; serverId: string }
  | { type: 'error'; serverId: string; reason: string }
  | { type: 'idle'; serverId: string }
  | { type: 'auth_required'; serverId: string; reason?: string }
  // Dynamic Client Registration isn't supported and no manual Client ID is
  // configured, so sign-in can't proceed without one. A structured signal rather
  // than an { type: 'error', reason: 'DCR_FAILED' } magic string: AuthHost opens
  // the recovery modal off the discriminant, and serverStore maps it to
  // auth_required with no user-facing reason text.
  | { type: 'dcr_required'; serverId: string }

// Redacted summary of a server's OAuth session, for the auth details panel.
// Derived facts only — the tokens themselves never cross the IPC boundary
// (same rule as getAuthedServerIds: booleans and metadata cross, secrets stay
// in main). Null from mcp:getAuthDetails = not an OAuth server, or no tokens.
export interface AuthDetails {
  // The OAuth client identity in use — the manually configured Client ID, or
  // the one the auth server issued via Dynamic Client Registration.
  clientId?: string
  // Where that identity came from.
  registration: 'manual' | 'dcr'
  // Whether a client secret is configured for this identity (manually, or
  // issued by the auth server during DCR) — never the secret itself.
  clientType: 'public' | 'confidential'
  // Scopes granted on the access token (space-separated), when the server
  // reported them in the token response.
  scope?: string
  tokenType?: string
  // ms epoch when the tokens were last issued (initial exchange or refresh).
  issuedAt?: number
  // ms epoch when the access token expires, or null when the server reported
  // no lifetime / nothing to anchor it to (treated as non-expiring).
  expiresAt: number | null
  hasRefreshToken: boolean
  // Whether an OpenID Connect id_token was returned alongside the access token.
  hasIdToken: boolean
  // The loopback callback URL registered for this session's redirect_uri —
  // useful for debugging a DCR redirect-URI mismatch against the auth server.
  redirectUri?: string
}

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

// A tool's preference for task-augmented (SEP-1686) execution. Mirrors the MCP
// SDK's ToolExecution shape. "required" means the tool MUST be invoked as a
// task (a plain tools/call is rejected); "optional" allows either; absent or
// "forbidden" means a normal call. MCPFlo only routes "required" tools through
// the task path — "optional" ones still use the plain call.
export type TaskSupport = 'required' | 'optional' | 'forbidden'

export interface ToolExecution {
  taskSupport?: TaskSupport
}

export interface Tool {
  name: string
  description?: string
  inputSchema: ToolInputSchema
  annotations?: ToolAnnotations
  execution?: ToolExecution
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

// One turn of a prompt's rendered output. Mirrors the MCP SDK's PromptMessage
// shape: a role plus a single content block (text/image/audio/resource), the
// same block shape a tool-call result carries — so the renderer reuses
// ContentBlockPreview to render it.
export interface PromptMessage {
  role: 'user' | 'assistant'
  content: ToolCallContent
}

// Result of getting a prompt — mirrors the MCP SDK's GetPromptResult shape. The
// optional description echoes the prompt's own; `messages` is the rendered
// conversation the prompt expands to.
export interface GetPromptResult {
  description?: string
  messages: PromptMessage[]
  [key: string]: unknown
}

// Outcome of getting a prompt as surfaced to the renderer. Mirrors
// `ResourceReadOutcome`: `response` is the JSON-RPC envelope ({ jsonrpc, result }
// or { jsonrpc, error }); `error` carries a transport-level message when no
// response arrived (e.g. a connection failure).
export interface PromptGetOutcome {
  response?: unknown
  error?: string
  // See ToolCallOutcome.authRequired.
  authRequired?: boolean
}

// Capabilities returned after a successful server connection. `authRequired` is
// set instead of the listings when the fetch couldn't proceed because the server
// needs (re-)authorization — an expired/rejected token, or an OAuth server that
// doesn't support DCR and has no manual Client ID yet. It's a benign outcome, not
// a failure: the auth event already fired (and, for DCR, opened the recovery
// modal), so the renderer shows the sign-in affordance rather than a red error.
export interface ConnectResult {
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
  authRequired?: boolean
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

// A form-mode elicitation request from a server (elicitation/create). The
// schema is restricted by the MCP spec to a flat object of primitive fields.
// URL-mode requests are rejected by the SDK before reaching us, since we only
// advertise form support.
export interface ElicitationParams {
  mode?: 'form'
  message: string
  requestedSchema: ToolInputSchema
  [key: string]: unknown
}

// The user's answer to an elicitation. `content` is present only on accept.
export interface ElicitationResult {
  action: 'accept' | 'decline' | 'cancel'
  content?: Record<string, unknown>
}

// Pushed from main to renderer over `mcp:elicitationRequest`. `callId` ties the
// request to the tool invocation that triggered it; `elicitationId` is the key
// the renderer must answer with via `mcp:respondToElicitation`.
export interface ElicitationRequestEvent {
  callId: string
  elicitationId: string
  serverName: string
  toolName: string
  params: ElicitationParams
}

// Pushed from main to renderer over `mcp:elicitationClosed` when a pending
// elicitation was settled without the user (server abort, call ended).
export interface ElicitationClosedEvent {
  elicitationId: string
}

// A single content block in a sampling message (text/image/audio). Mirrors the
// MCP SDK's content shape; only `text` is rendered specially, the rest fall
// back to raw JSON.
export interface SamplingContent {
  type: string
  text?: string
  [key: string]: unknown
}

// One turn in the conversation a server hands us to "complete".
export interface SamplingMessage {
  role: 'user' | 'assistant'
  content: SamplingContent
}

// A sampling/createMessage request from a server: it's asking the client to run
// an LLM completion. MCPFlo answers it by hand (human-in-the-loop) rather than
// calling a model, keeping the tool deterministic and token-free.
export interface SamplingParams {
  messages: SamplingMessage[]
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
  includeContext?: string
  modelPreferences?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

// The user's answer to a sampling request. The assistant turn (`content`,
// `model`, `stopReason`) is present only on accept; decline/cancel become a
// JSON-RPC error back to the server, since CreateMessageResult has no "action".
export interface SamplingResult {
  action: 'accept' | 'decline' | 'cancel'
  content?: SamplingContent
  model?: string
  stopReason?: string
}

// Pushed from main to renderer over `mcp:samplingRequest`. `callId` ties the
// request to the tool invocation that triggered it; `samplingId` is the key the
// renderer must answer with via `mcp:respondToSampling`.
export interface SamplingRequestEvent {
  callId: string
  samplingId: string
  serverName: string
  toolName: string
  params: SamplingParams
}

// Pushed from main to renderer over `mcp:samplingClosed` when a pending
// sampling request was settled without the user (server abort, call ended).
export interface SamplingClosedEvent {
  samplingId: string
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
  // True when the call failed because the server requires (re-)authorization
  // (SDK `UnauthorizedError`). The renderer uses this to flip the server's
  // `auth` field to `auth_required` and surface the re-auth affordance.
  authRequired?: boolean
}

// A single content entry of a resources/read result. Mirrors the MCP SDK's
// ResourceContents shape: text resources carry `text`, binary ones carry a
// base64 `blob`; `uri` echoes which resource the entry belongs to.
export interface ResourceContent {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
  [key: string]: unknown
}

// Result of reading a resource — mirrors the MCP SDK's ReadResourceResult shape.
export interface ResourceReadResult {
  contents: ResourceContent[]
  [key: string]: unknown
}

// Outcome of a resource read as surfaced to the renderer. Mirrors
// `ToolCallOutcome`: `response` is the JSON-RPC envelope ({ jsonrpc, result } or
// { jsonrpc, error }); `error` carries a transport-level message when no
// response arrived (e.g. a connection failure).
export interface ResourceReadOutcome {
  response?: unknown
  error?: string
  // See ToolCallOutcome.authRequired.
  authRequired?: boolean
}

// Capabilities persisted to disk (servers/<id>/capabilities.json) so they're
// available before fetching and across app restarts.
export interface CachedCapabilities {
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
  fetchedAt: number
}

// Advanced, rarely-changed connection knobs — layered on top of the transport
// config rather than folded into it, since they're transport-agnostic.
export interface ServerOverrides {
  // Timeout (ms) for the initial connect handshake. Omitted means the MCP SDK's
  // own default (60s) applies.
  timeoutMs?: number
  // Protocol revision to request in the initialize handshake (see
  // shared/protocolVersions.ts). Omitted means the SDK's latest. Per MCP
  // version negotiation the server may still answer with a different revision —
  // this pins what we ask for, not the outcome.
  protocolVersion?: string
}

// The persistable subset — stored on disk, no runtime state
export interface ServerConfig {
  id: string
  name: string
  transport: TransportConfig
  overrides?: ServerOverrides
}

// What getServers hands back: the stored config plus a read-time flag set when
// its encrypted secret couldn't be decrypted on this machine (e.g. config.json
// copied from another install/OS user). The server still loads with its public
// config so one unreadable secret can't hide the whole list — the flag lets the
// UI mark it degraded and prompt the user to re-enter credentials.
export interface LoadedServer extends ServerConfig {
  credentialsUnavailable?: boolean
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
  // OAuth sign-in state. Runtime-only (never persisted to config.json) and
  // present only for servers whose transport uses `auth: 'oauth'`.
  auth?: ServerAuthState
  // True when the server's encrypted secret couldn't be decrypted on load (see
  // LoadedServer). The server is usable for non-secret operations but its
  // credentials are missing until re-entered.
  credentialsUnavailable?: boolean
}
