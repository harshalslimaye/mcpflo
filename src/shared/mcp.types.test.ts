import { describe, it, expect } from 'vitest'
import type {
  MCPServer,
  ServerConfig,
  Tool,
  Resource,
  Prompt,
  TransportConfig,
  StdioTransportConfig,
  SseTransportConfig,
  StreamableHttpTransportConfig,
  ServerStatus
} from './mcp.types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const stdioTransport: StdioTransportConfig = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_TOKEN: 'ghp_test' }
}

const sseTransport: SseTransportConfig = {
  type: 'sse',
  url: 'https://mcp.example.com/sse',
  headers: { Authorization: 'Bearer token' }
}

const streamableHttpTransport: StreamableHttpTransportConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/mcp'
}

const tool: Tool = {
  name: 'list_issues',
  description: 'List GitHub issues for a repository',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' }
    },
    required: ['owner', 'repo']
  }
}

const resource: Resource = {
  uri: 'github://repos/owner/repo',
  name: 'Repository',
  description: 'A GitHub repository',
  mimeType: 'application/json'
}

const prompt: Prompt = {
  name: 'summarize_pr',
  description: 'Summarize a pull request',
  arguments: [
    { name: 'pr_number', description: 'PR number', required: true },
    { name: 'style', description: 'Summary style', required: false }
  ]
}

const serverConfig: ServerConfig = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  description: 'GitHub integration via MCP',
  transport: stdioTransport
}

const server: MCPServer = {
  ...serverConfig,
  status: 'connected',
  tools: [tool],
  resources: [resource],
  prompts: [prompt]
}

// ── TransportConfig ───────────────────────────────────────────────────────────

describe('StdioTransportConfig', () => {
  it('has type stdio', () => {
    expect(stdioTransport.type).toBe('stdio')
  })

  it('requires command', () => {
    expect(stdioTransport.command).toBe('npx')
  })

  it('accepts optional args and env', () => {
    expect(stdioTransport.args).toEqual(['-y', '@modelcontextprotocol/server-github'])
    expect(stdioTransport.env?.GITHUB_TOKEN).toBe('ghp_test')
  })

  it('works without optional fields', () => {
    const minimal: StdioTransportConfig = { type: 'stdio', command: 'node' }
    expect(minimal.args).toBeUndefined()
    expect(minimal.env).toBeUndefined()
  })
})

describe('SseTransportConfig', () => {
  it('has type sse', () => {
    expect(sseTransport.type).toBe('sse')
  })

  it('requires url', () => {
    expect(sseTransport.url).toBe('https://mcp.example.com/sse')
  })

  it('accepts optional headers', () => {
    expect(sseTransport.headers?.Authorization).toBe('Bearer token')
  })

  it('works without optional fields', () => {
    const minimal: SseTransportConfig = { type: 'sse', url: 'https://example.com' }
    expect(minimal.headers).toBeUndefined()
  })
})

describe('StreamableHttpTransportConfig', () => {
  it('has type streamable-http', () => {
    expect(streamableHttpTransport.type).toBe('streamable-http')
  })

  it('requires url', () => {
    expect(streamableHttpTransport.url).toBe('https://mcp.example.com/mcp')
  })
})

describe('TransportConfig discriminated union', () => {
  it('narrows to StdioTransportConfig on type stdio', () => {
    const t: TransportConfig = stdioTransport
    if (t.type === 'stdio') expect(t.command).toBeDefined()
  })

  it('narrows to SseTransportConfig on type sse', () => {
    const t: TransportConfig = sseTransport
    if (t.type === 'sse') expect(t.url).toBeDefined()
  })

  it('narrows to StreamableHttpTransportConfig on type streamable-http', () => {
    const t: TransportConfig = streamableHttpTransport
    if (t.type === 'streamable-http') expect(t.url).toBeDefined()
  })
})

// ── ServerStatus ──────────────────────────────────────────────────────────────

describe('ServerStatus', () => {
  it('accepts all valid statuses', () => {
    const statuses: ServerStatus[] = ['connected', 'connecting', 'disconnected', 'error']
    expect(statuses).toHaveLength(4)
  })
})

// ── Tool ──────────────────────────────────────────────────────────────────────

describe('Tool', () => {
  it('has required name field', () => {
    expect(tool.name).toBe('list_issues')
  })

  it('has inputSchema with type object', () => {
    expect(tool.inputSchema.type).toBe('object')
  })

  it('accepts optional description', () => {
    expect(tool.description).toBeDefined()
  })

  it('works without description', () => {
    const minimal: Tool = { name: 'ping', inputSchema: { type: 'object' } }
    expect(minimal.description).toBeUndefined()
  })
})

// ── Resource ─────────────────────────────────────────────────────────────────

describe('Resource', () => {
  it('has required uri field', () => {
    expect(resource.uri).toBe('github://repos/owner/repo')
  })

  it('accepts optional name, description, mimeType', () => {
    expect(resource.name).toBe('Repository')
    expect(resource.mimeType).toBe('application/json')
  })

  it('works with uri only', () => {
    const minimal: Resource = { uri: 'file:///tmp/data.json' }
    expect(minimal.name).toBeUndefined()
    expect(minimal.mimeType).toBeUndefined()
  })
})

// ── Prompt ───────────────────────────────────────────────────────────────────

describe('Prompt', () => {
  it('has required name field', () => {
    expect(prompt.name).toBe('summarize_pr')
  })

  it('accepts arguments array', () => {
    expect(prompt.arguments).toHaveLength(2)
  })

  it('argument has name and optional required flag', () => {
    expect(prompt.arguments?.[0].name).toBe('pr_number')
    expect(prompt.arguments?.[0].required).toBe(true)
    expect(prompt.arguments?.[1].required).toBe(false)
  })

  it('works without arguments', () => {
    const minimal: Prompt = { name: 'hello' }
    expect(minimal.arguments).toBeUndefined()
  })
})

// ── ServerConfig ──────────────────────────────────────────────────────────────

describe('ServerConfig', () => {
  it('has required id, name, transport', () => {
    expect(serverConfig.id).toBe('github-mcp')
    expect(serverConfig.name).toBe('GitHub MCP')
    expect(serverConfig.transport).toBeDefined()
  })

  it('accepts optional description', () => {
    expect(serverConfig.description).toBe('GitHub integration via MCP')
  })

  it('works without optional fields', () => {
    const minimal: ServerConfig = {
      id: 'min',
      name: 'Min',
      transport: { type: 'stdio', command: 'node' }
    }
    expect(minimal.description).toBeUndefined()
  })

  it('does not carry runtime state', () => {
    expect((serverConfig as Record<string, unknown>).status).toBeUndefined()
    expect((serverConfig as Record<string, unknown>).tools).toBeUndefined()
  })
})

// ── MCPServer ─────────────────────────────────────────────────────────────────

describe('MCPServer', () => {
  it('extends ServerConfig fields', () => {
    expect(server.id).toBe('github-mcp')
    expect(server.name).toBe('GitHub MCP')
    expect(server.transport).toBeDefined()
  })

  it('has status', () => {
    expect(server.status).toBe('connected')
  })

  it('carries tools, resources, prompts', () => {
    expect(server.tools).toHaveLength(1)
    expect(server.resources).toHaveLength(1)
    expect(server.prompts).toHaveLength(1)
  })

  it('initialises with empty capability arrays', () => {
    const empty: MCPServer = {
      id: 'empty',
      name: 'Empty',
      transport: { type: 'stdio', command: 'node' },
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: []
    }
    expect(empty.tools).toHaveLength(0)
    expect(empty.resources).toHaveLength(0)
    expect(empty.prompts).toHaveLength(0)
  })

  it('accepts optional error field', () => {
    const errored: MCPServer = { ...server, status: 'error', error: 'Connection refused' }
    expect(errored.error).toBe('Connection refused')
  })

  it('works without optional fields', () => {
    const minimal: MCPServer = {
      id: 'min',
      name: 'Min',
      transport: { type: 'stdio', command: 'node' },
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: []
    }
    expect(minimal.description).toBeUndefined()
    expect(minimal.error).toBeUndefined()
  })
})
