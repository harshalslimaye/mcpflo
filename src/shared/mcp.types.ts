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

export interface Tool {
  name: string
  description?: string
  inputSchema: ToolInputSchema
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

// The persistable subset — stored on disk, no runtime state
export interface ServerConfig {
  id: string
  name: string
  description?: string
  transport: TransportConfig
}

// A configured MCP server and its discovered capabilities
export interface MCPServer extends ServerConfig {
  status: ServerStatus
  error?: string
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
}
