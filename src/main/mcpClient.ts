import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
import type { ServerConfig, Tool, Resource, Prompt, ToolCallOutcome } from '../shared/mcp.types'

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

  const client = new Client({ name: 'mcpflo', version: '1.0.0' })
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
  args: Record<string, unknown>
): Promise<ToolCallOutcome> {
  let requestId: string | number | undefined
  let response: unknown

  try {
    const { client, transport } = await openClient(config)

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
      originalOnMessage?.(message)
    }

    await client.callTool({ name: toolName, arguments: args })
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
