import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
import type { ServerConfig, Tool, Resource, Prompt } from '../shared/mcp.types'

export interface ConnectResult {
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
}

// Active clients keyed by server ID
const clients = new Map<string, Client>()

export async function connectServer(config: ServerConfig): Promise<ConnectResult> {
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
