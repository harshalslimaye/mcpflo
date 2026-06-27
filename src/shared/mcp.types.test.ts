import { describe, it, expect } from 'vitest'
import type {
  MCPServer,
  ServerConfig,
  Tool,
  Resource,
  Prompt,
  TransportConfig,
  StdioTransportConfig,
  StreamableHttpTransportConfig,
  ServerStatus,
  ServerAuthState,
  AuthEvent
} from './mcp.types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const stdioTransport: StdioTransportConfig = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_TOKEN: 'ghp_test' }
}

const streamableHttpTransport: StreamableHttpTransportConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/mcp',
  headers: { Authorization: 'Bearer token' }
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

describe('StreamableHttpTransportConfig', () => {
  it('has type streamable-http', () => {
    expect(streamableHttpTransport.type).toBe('streamable-http')
  })

  it('requires url', () => {
    expect(streamableHttpTransport.url).toBe('https://mcp.example.com/mcp')
  })

  it('accepts optional headers', () => {
    expect(streamableHttpTransport.headers?.Authorization).toBe('Bearer token')
  })

  it('works without optional fields', () => {
    const minimal: StreamableHttpTransportConfig = {
      type: 'streamable-http',
      url: 'https://example.com'
    }
    expect(minimal.headers).toBeUndefined()
    expect(minimal.auth).toBeUndefined()
    expect(minimal.oauth).toBeUndefined()
  })

  it('accepts an oauth auth mode with optional client config', () => {
    const oauth: StreamableHttpTransportConfig = {
      type: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
      auth: 'oauth',
      oauth: { clientId: 'abc', clientSecret: 'shh', scope: 'read:tools' }
    }
    expect(oauth.auth).toBe('oauth')
    expect(oauth.oauth?.clientId).toBe('abc')
    expect(oauth.oauth?.scope).toBe('read:tools')
  })

  it('accepts oauth mode relying purely on DCR (no client config)', () => {
    const oauth: StreamableHttpTransportConfig = {
      type: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
      auth: 'oauth'
    }
    expect(oauth.auth).toBe('oauth')
    expect(oauth.oauth).toBeUndefined()
  })
})

describe('TransportConfig discriminated union', () => {
  it('narrows to StdioTransportConfig on type stdio', () => {
    const t: TransportConfig = stdioTransport
    if (t.type === 'stdio') expect(t.command).toBeDefined()
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

// ── ServerAuthState ───────────────────────────────────────────────────────────

describe('ServerAuthState', () => {
  it('accepts each auth status', () => {
    const states: ServerAuthState[] = [
      { status: 'idle' },
      { status: 'authenticating' },
      { status: 'authenticated' },
      { status: 'auth_required' }
    ]
    expect(states).toHaveLength(4)
  })

  it('carries an optional reason on auth_required', () => {
    const s: ServerAuthState = { status: 'auth_required', reason: 'token expired' }
    if (s.status === 'auth_required') expect(s.reason).toBe('token expired')
  })

  it('attaches to an MCPServer as an optional runtime field', () => {
    const authed: MCPServer = { ...server, auth: { status: 'authenticated' } }
    expect(authed.auth?.status).toBe('authenticated')
    expect(server.auth).toBeUndefined()
  })
})

// ── AuthEvent ─────────────────────────────────────────────────────────────────

describe('AuthEvent', () => {
  it('models each push variant and narrows on type', () => {
    const events: AuthEvent[] = [
      { type: 'pending', serverId: 's1' },
      { type: 'success', serverId: 's1' },
      { type: 'error', serverId: 's1', reason: 'DCR_FAILED' },
      { type: 'idle', serverId: 's1' },
      { type: 'auth_required', serverId: 's1', reason: 'expired' }
    ]
    const err = events.find((e) => e.type === 'error')
    if (err?.type === 'error') expect(err.reason).toBe('DCR_FAILED')
    expect(events).toHaveLength(5)
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

  it('does not carry runtime state', () => {
    expect((serverConfig as Record<string, unknown>).status).toBeUndefined()
    expect((serverConfig as Record<string, unknown>).tools).toBeUndefined()
  })

  it('accepts an optional overrides.timeoutMs', () => {
    const withTimeout: ServerConfig = { ...serverConfig, overrides: { timeoutMs: 5000 } }
    expect(withTimeout.overrides?.timeoutMs).toBe(5000)
  })

  it('works without overrides', () => {
    expect(serverConfig.overrides).toBeUndefined()
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
    expect(minimal.error).toBeUndefined()
  })
})
