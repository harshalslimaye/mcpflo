import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerConfig } from '../shared/mcp.types'

interface MockTransport {
  // HTTP transports also record the URL they were constructed with.
  url?: URL
  opts: Record<string, unknown> | undefined
  send: (message: unknown) => unknown
  onmessage: ((message: unknown) => void) | undefined
  finishAuth?: (code: string) => unknown
}

const h = vi.hoisted(() => ({
  client: {
    connect: vi.fn(),
    listTools: vi.fn(),
    listResources: vi.fn(),
    listPrompts: vi.fn(),
    callTool: vi.fn(),
    readResource: vi.fn(),
    getPrompt: vi.fn(),
    experimental: { tasks: { callToolStream: vi.fn() } },
    setRequestHandler: vi.fn(),
    close: vi.fn()
  },
  clientCtor: vi.fn(),
  transports: [] as Array<{
    url?: URL
    opts: Record<string, unknown> | undefined
    send: (message: unknown) => unknown
    onmessage: ((message: unknown) => void) | undefined
    finishAuth?: (code: string) => unknown
  }>,
  // OAuth dependency mocks (oauthProvider / oauthStore / secrets).
  startLoopbackListener: vi.fn(),
  createOAuthProvider: vi.fn(() => ({})),
  readOAuthState: vi.fn(),
  saveRedirectPort: vi.fn(),
  clearClientInformation: vi.fn(),
  isSecretStorageAvailable: vi.fn(() => true),
  // Login-shell PATH resolution used to build a stdio server's spawn env.
  resolveShellPath: vi.fn<() => string | undefined>(() => '/opt/homebrew/bin:/usr/bin'),
  // A controllable loopback handle: tests set `result` and inspect `close`.
  loopback: { port: 0, result: Promise.resolve({ code: 'CODE' }), close: vi.fn() }
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    constructor(info: unknown, options?: unknown) {
      h.clientCtor(info, options)
      return Object.assign(this, h.client)
    }
  }
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    opts: Record<string, unknown>
    send = vi.fn()
    onmessage: ((message: unknown) => void) | undefined
    constructor(opts: Record<string, unknown>) {
      this.opts = opts
      h.transports.push(this)
    }
  },
  getDefaultEnvironment: () => ({ PATH: '/usr/bin' })
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    url: URL
    opts: Record<string, unknown> | undefined
    send = vi.fn()
    onmessage: ((message: unknown) => void) | undefined
    finishAuth = vi.fn()
    constructor(url: URL, opts?: Record<string, unknown>) {
      this.url = url
      this.opts = opts
      h.transports.push(this)
    }
  }
}))

// Minimal UnauthorizedError so mcpClient's `instanceof` checks have a class to
// match. Re-imported post-reset in beforeEach so identities line up (same as the
// schemas pattern below).
vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message?: string) {
      super(message)
      this.name = 'UnauthorizedError'
    }
  }
}))

vi.mock('./secrets', () => ({
  isSecretStorageAvailable: h.isSecretStorageAvailable
}))

vi.mock('./oauthStore', () => ({
  readOAuthState: h.readOAuthState,
  saveRedirectPort: h.saveRedirectPort,
  clearClientInformation: h.clearClientInformation,
  EncryptionUnavailableError: class EncryptionUnavailableError extends Error {
    code = 'ENCRYPTION_UNAVAILABLE'
    constructor() {
      super('OAuth tokens require OS-level encryption, which is not available on this system.')
    }
  }
}))

vi.mock('./oauthProvider', () => ({
  startLoopbackListener: h.startLoopbackListener,
  createOAuthProvider: h.createOAuthProvider
}))

vi.mock('./shellPath', () => ({ resolveShellPath: h.resolveShellPath }))

const stdioConfig: ServerConfig = {
  id: 'srv-1',
  name: 'Test Server',
  transport: { type: 'stdio', command: 'npx', args: ['-y', 'server'], env: { FOO: 'bar' } }
}

const streamableHttpConfig: ServerConfig = {
  id: 'srv-4',
  name: 'Streamable HTTP Server',
  transport: {
    type: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { Authorization: 'Bearer tok' }
  }
}

const streamableHttpNoHeadersConfig: ServerConfig = {
  id: 'srv-5',
  name: 'Streamable HTTP Server (no auth)',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp' }
}

const oauthConfig: ServerConfig = {
  id: 'srv-oauth',
  name: 'OAuth Server',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp', auth: 'oauth', oauth: {} }
}

// The last transport openClient constructed — the one the current call taps.
function lastTransport(): MockTransport {
  return h.transports[h.transports.length - 1]
}

describe('mcpClient', () => {
  let mod: typeof import('./mcpClient')
  // Loaded from the same (post-reset) module instance as `mod`, so schema
  // references match the ones mcpClient passes to setRequestHandler.
  let schemas: typeof import('@modelcontextprotocol/sdk/types.js')
  // Same reason for UnauthorizedError: mcpClient's `instanceof` check must see
  // the class from the same post-reset import the test throws.
  let authMod: typeof import('@modelcontextprotocol/sdk/client/auth.js')

  beforeEach(async () => {
    vi.clearAllMocks()
    h.transports.length = 0
    h.client.connect.mockResolvedValue(undefined)
    h.client.listTools.mockResolvedValue({
      tools: [{ name: 'echo', inputSchema: { type: 'object' } }]
    })
    h.client.listResources.mockResolvedValue({ resources: [{ uri: 'mem://x' }] })
    h.client.listPrompts.mockResolvedValue({ prompts: [] })
    h.client.callTool.mockResolvedValue({ content: [] })
    h.client.readResource.mockResolvedValue({ contents: [] })
    h.client.getPrompt.mockResolvedValue({ messages: [] })
    h.client.close.mockResolvedValue(undefined)
    // OAuth mock defaults: a successful token-valid connect, fresh loopback.
    h.isSecretStorageAvailable.mockReturnValue(true)
    h.resolveShellPath.mockReturnValue('/opt/homebrew/bin:/usr/bin')
    h.readOAuthState.mockResolvedValue(null)
    h.saveRedirectPort.mockResolvedValue(undefined)
    h.clearClientInformation.mockResolvedValue(undefined)
    h.createOAuthProvider.mockReturnValue({})
    h.loopback.port = 51234
    h.loopback.result = Promise.resolve({ code: 'CODE' })
    h.loopback.close = vi.fn()
    h.startLoopbackListener.mockResolvedValue(h.loopback)
    vi.resetModules()
    mod = await import('./mcpClient')
    schemas = await import('@modelcontextprotocol/sdk/types.js')
    authMod = await import('@modelcontextprotocol/sdk/client/auth.js')
  })

  // The handler mcpClient registered for a given server-request schema.
  function handlerForSchema(
    schema: unknown
  ): (
    request: unknown,
    extra: { signal: AbortSignal; taskStore?: unknown; taskRequestedTtl?: number }
  ) => Promise<unknown> {
    const call = h.client.setRequestHandler.mock.calls.find((c) => c[0] === schema)
    if (!call) throw new Error('no handler registered for schema')
    return call[1]
  }

  describe('connectServer', () => {
    it('returns the listed tools, resources and prompts', async () => {
      const result = await mod.connectServer(stdioConfig)
      expect(result.tools).toEqual([{ name: 'echo', inputSchema: { type: 'object' } }])
      expect(result.resources).toEqual([{ uri: 'mem://x' }])
      expect(result.prompts).toEqual([])
      expect(h.clientCtor).toHaveBeenCalledWith(
        { name: 'mcpflo', version: '1.0.0' },
        {
          capabilities: {
            sampling: {},
            elicitation: {},
            tasks: {
              requests: {
                sampling: { createMessage: {} },
                elicitation: { create: {} }
              }
            }
          },
          // Backs task-augmented requests; the SDK serves tasks/* from it.
          taskStore: expect.anything()
        }
      )
    })

    it('preserves the execution.taskSupport hint on tools', async () => {
      h.client.listTools.mockResolvedValue({
        tools: [
          {
            name: 'research',
            inputSchema: { type: 'object' },
            execution: { taskSupport: 'required' }
          }
        ]
      })
      const result = await mod.connectServer(stdioConfig)
      expect(result.tools[0].execution).toEqual({ taskSupport: 'required' })
    })

    it('falls back to empty lists when a capability listing fails', async () => {
      h.client.listTools.mockRejectedValue(new Error('tools not supported'))
      h.client.listResources.mockRejectedValue(new Error('resources not supported'))
      h.client.listPrompts.mockRejectedValue(new Error('prompts not supported'))
      const result = await mod.connectServer(stdioConfig)
      expect(result.tools).toEqual([])
      expect(result.resources).toEqual([])
      expect(result.prompts).toEqual([])
    })

    it('connects with no explicit timeout when overrides are unset', async () => {
      await mod.connectServer(stdioConfig)
      expect(h.client.connect).toHaveBeenCalledWith(expect.anything(), { timeout: undefined })
    })

    it('passes overrides.timeoutMs as the connect timeout', async () => {
      await mod.connectServer({ ...stdioConfig, overrides: { timeoutMs: 5000 } })
      expect(h.client.connect).toHaveBeenCalledWith(expect.anything(), { timeout: 5000 })
    })

    it('spawns with the login-shell PATH plus the safe default and configured vars', async () => {
      await mod.connectServer(stdioConfig)
      expect(lastTransport().opts).toEqual({
        command: 'npx',
        args: ['-y', 'server'],
        // PATH comes from the resolved login shell, overriding the default env's.
        env: { PATH: '/opt/homebrew/bin:/usr/bin', FOO: 'bar' }
      })
    })

    it('keeps the default env PATH when login-shell resolution yields nothing', async () => {
      h.resolveShellPath.mockReturnValue(undefined)
      await mod.connectServer(stdioConfig)
      expect((lastTransport().opts?.env as Record<string, string>).PATH).toBe('/usr/bin')
    })

    it('lets a user-configured PATH override the resolved login-shell PATH', async () => {
      await mod.connectServer({
        ...stdioConfig,
        transport: { type: 'stdio', command: 'npx', args: [], env: { PATH: '/custom/bin' } }
      })
      expect((lastTransport().opts?.env as Record<string, string>).PATH).toBe('/custom/bin')
    })

    it('connects over a streamable-http transport', async () => {
      const result = await mod.connectServer(streamableHttpConfig)
      expect(result.tools).toEqual([{ name: 'echo', inputSchema: { type: 'object' } }])
      expect(lastTransport().url?.toString()).toBe('https://example.com/mcp')
    })
  })

  describe('transport construction', () => {
    it('builds a streamable-http transport with the URL and auth headers', async () => {
      await mod.connectServer(streamableHttpConfig)
      const t = lastTransport()
      expect(t.url?.toString()).toBe('https://example.com/mcp')
      expect(t.opts).toEqual({ requestInit: { headers: { Authorization: 'Bearer tok' } } })
    })

    it('passes no opts to a streamable-http transport without headers', async () => {
      await mod.connectServer(streamableHttpNoHeadersConfig)
      expect(lastTransport().opts).toBeUndefined()
    })

    it('refuses to build a transport that ships a credential header over plain http', async () => {
      // A config that bypassed the form (e.g. hand-edited config.json) must not
      // leak a credential in cleartext — the guard fails the connect.
      const insecure: ServerConfig = {
        id: 'srv-insecure',
        name: 'Insecure',
        transport: {
          type: 'streamable-http',
          url: 'http://mcp.example.com/mcp',
          headers: { Authorization: 'Bearer tok' }
        }
      }
      await expect(mod.connectServer(insecure)).rejects.toThrow('cleartext over http')
    })

    it('allows a credential header over http to a loopback host', async () => {
      const local: ServerConfig = {
        id: 'srv-local',
        name: 'Local',
        transport: {
          type: 'streamable-http',
          url: 'http://127.0.0.1:8080/mcp',
          headers: { Authorization: 'Bearer tok' }
        }
      }
      await expect(mod.connectServer(local)).resolves.toBeDefined()
    })
  })

  describe('callTool', () => {
    it('captures and returns the full JSON-RPC response envelope', async () => {
      const envelope = {
        jsonrpc: '2.0',
        id: 7,
        result: { content: [{ type: 'text', text: 'ok' }] }
      }
      h.client.callTool.mockImplementation(async () => {
        const t = lastTransport()
        t.send({ jsonrpc: '2.0', id: 7, method: 'tools/call' })
        t.onmessage?.(envelope)
        return envelope.result
      })
      const outcome = await mod.callTool(stdioConfig, 'echo', { msg: 'hi' })
      expect(outcome.response).toEqual(envelope)
      expect(outcome.error).toBeUndefined()
      // The no-op onprogress makes the SDK attach a progressToken so servers
      // emit notifications/progress; the long timeout keeps the call alive
      // while the user answers an elicitation.
      expect(h.client.callTool).toHaveBeenCalledWith(
        { name: 'echo', arguments: { msg: 'hi' } },
        undefined,
        { onprogress: expect.any(Function), timeout: 30 * 60_000, resetTimeoutOnProgress: true }
      )
    })

    it('forwards notification frames to onNotification, skipping noise', async () => {
      const envelope = { jsonrpc: '2.0', id: 7, result: { content: [] } }
      h.client.callTool.mockImplementation(async () => {
        const t = lastTransport()
        // Before the tools/call request goes out: handshake traffic, dropped.
        t.onmessage?.({ jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 0 } })
        t.send({ jsonrpc: '2.0', id: 7, method: 'tools/call' })
        t.onmessage?.({
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: { progressToken: 7, progress: 1, total: 5 }
        })
        t.onmessage?.({
          jsonrpc: '2.0',
          method: 'notifications/message',
          params: { level: 'info', data: 'step done' }
        })
        // Housekeeping methods are dropped even mid-call.
        t.onmessage?.({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })
        t.onmessage?.({ jsonrpc: '2.0', method: 'notifications/resources/list_changed' })
        // A server-to-client *request* (has an id) is not a notification.
        t.onmessage?.({ jsonrpc: '2.0', id: 42, method: 'sampling/createMessage', params: {} })
        t.onmessage?.(envelope)
        return envelope.result
      })

      const received: Array<{ method: string }> = []
      const outcome = await mod.callTool(stdioConfig, 'echo', {}, (n) => received.push(n))

      expect(outcome.response).toEqual(envelope)
      expect(received.map((n) => n.method)).toEqual([
        'notifications/progress',
        'notifications/message'
      ])
    })

    it('ignores response frames whose id does not match the request', async () => {
      const matching = { jsonrpc: '2.0', id: 7, result: { content: [] } }
      h.client.callTool.mockImplementation(async () => {
        const t = lastTransport()
        t.send({ jsonrpc: '2.0', id: 7, method: 'tools/call' })
        t.onmessage?.({ jsonrpc: '2.0', id: 99, result: { content: [{ type: 'text' }] } })
        t.onmessage?.(matching)
        return matching.result
      })
      const outcome = await mod.callTool(stdioConfig, 'echo', {})
      expect(outcome.response).toEqual(matching)
    })

    it('returns the error envelope when the SDK throws after a JSON-RPC error frame', async () => {
      const errorEnvelope = {
        jsonrpc: '2.0',
        id: 7,
        error: { code: -32602, message: 'Invalid params' }
      }
      h.client.callTool.mockImplementation(async () => {
        const t = lastTransport()
        t.send({ jsonrpc: '2.0', id: 7, method: 'tools/call' })
        t.onmessage?.(errorEnvelope)
        throw new Error('MCP error -32602: Invalid params')
      })
      const outcome = await mod.callTool(stdioConfig, 'echo', {})
      expect(outcome.response).toEqual(errorEnvelope)
      expect(outcome.error).toBeUndefined()
    })

    it('returns a transport error when the call fails before any response', async () => {
      h.client.connect.mockRejectedValue(new Error('spawn npx ENOENT'))
      const outcome = await mod.callTool(stdioConfig, 'echo', {})
      expect(outcome.response).toBeUndefined()
      expect(outcome.error).toBe('spawn npx ENOENT')
    })

    it('runs a call over a streamable-http transport', async () => {
      const outcome = await mod.callTool(streamableHttpConfig, 'echo', {})
      expect(outcome.error).toBeUndefined()
      expect(lastTransport().url?.toString()).toBe('https://example.com/mcp')
    })

    it('keeps the connection warm after the call', async () => {
      await mod.callTool(stdioConfig, 'echo', {})
      expect(h.client.close).not.toHaveBeenCalled()
    })

    it('reuses the warm connection across calls instead of respawning', async () => {
      await mod.callTool(stdioConfig, 'echo', {})
      await mod.callTool(stdioConfig, 'echo', {})
      // One spawn + one handshake for both calls.
      expect(h.transports).toHaveLength(1)
      expect(h.client.connect).toHaveBeenCalledTimes(1)
    })

    it('serializes calls to the same server (one active call at a time)', async () => {
      let active = 0
      let maxConcurrent = 0
      h.client.callTool.mockImplementation(async () => {
        active++
        maxConcurrent = Math.max(maxConcurrent, active)
        await Promise.resolve()
        active--
        return { content: [] }
      })
      await Promise.all([
        mod.callTool(stdioConfig, 'echo', {}),
        mod.callTool(stdioConfig, 'echo', {})
      ])
      expect(maxConcurrent).toBe(1)
    })
  })

  describe('readResource', () => {
    it('wraps the SDK result in a synthesized JSON-RPC envelope', async () => {
      const result = {
        contents: [{ uri: 'mem://x', mimeType: 'text/plain', text: 'hello' }]
      }
      h.client.readResource.mockResolvedValue(result)
      const outcome = await mod.readResource(stdioConfig, 'mem://x')
      expect(outcome.response).toEqual({ jsonrpc: '2.0', result })
      expect(outcome.error).toBeUndefined()
      expect(h.client.readResource).toHaveBeenCalledWith({ uri: 'mem://x' })
    })

    it('returns a transport-level error when the read throws', async () => {
      h.client.readResource.mockRejectedValue(new Error('resource not found'))
      const outcome = await mod.readResource(stdioConfig, 'mem://missing')
      expect(outcome.response).toBeUndefined()
      expect(outcome.error).toBe('resource not found')
    })

    it('reads over a streamable-http transport', async () => {
      const outcome = await mod.readResource(streamableHttpConfig, 'mem://x')
      expect(outcome.response).toEqual({ jsonrpc: '2.0', result: { contents: [] } })
    })

    it('reuses the warm pooled connection across reads', async () => {
      await mod.readResource(stdioConfig, 'mem://a')
      await mod.readResource(stdioConfig, 'mem://b')
      // One spawn (connect) shared by both reads.
      expect(h.client.connect).toHaveBeenCalledTimes(1)
    })
  })

  describe('getPrompt', () => {
    it('wraps the SDK result in a synthesized JSON-RPC envelope', async () => {
      const result = {
        description: 'A greeting',
        messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }]
      }
      h.client.getPrompt.mockResolvedValue(result)
      const outcome = await mod.getPrompt(stdioConfig, 'greet', { name: 'Ada' })
      expect(outcome.response).toEqual({ jsonrpc: '2.0', result })
      expect(outcome.error).toBeUndefined()
      expect(h.client.getPrompt).toHaveBeenCalledWith({
        name: 'greet',
        arguments: { name: 'Ada' }
      })
    })

    it('returns a transport-level error when the get throws', async () => {
      h.client.getPrompt.mockRejectedValue(new Error('prompt not found'))
      const outcome = await mod.getPrompt(stdioConfig, 'missing', {})
      expect(outcome.response).toBeUndefined()
      expect(outcome.error).toBe('prompt not found')
    })

    it('gets a prompt over a streamable-http transport', async () => {
      const outcome = await mod.getPrompt(streamableHttpConfig, 'greet', {})
      expect(outcome.response).toEqual({ jsonrpc: '2.0', result: { messages: [] } })
    })

    it('reuses the warm pooled connection across gets', async () => {
      await mod.getPrompt(stdioConfig, 'a', {})
      await mod.getPrompt(stdioConfig, 'b', {})
      // One spawn (connect) shared by both gets.
      expect(h.client.connect).toHaveBeenCalledTimes(1)
    })
  })

  describe('task-augmented calls (SEP-1686)', () => {
    // Builds the async generator callToolStream returns from a fixed list of
    // lifecycle frames.
    function stream(messages: unknown[]): () => AsyncGenerator<unknown> {
      return async function* () {
        for (const message of messages) yield message
      }
    }

    it('routes taskSupport "required" through callToolStream, not callTool', async () => {
      h.client.experimental.tasks.callToolStream.mockImplementation(
        stream([{ type: 'result', result: { content: [{ type: 'text', text: 'done' }] } }])
      )
      const outcome = await mod.callTool(
        stdioConfig,
        'research',
        { topic: 'mcp' },
        undefined,
        undefined,
        undefined,
        'required'
      )
      expect(h.client.callTool).not.toHaveBeenCalled()
      // `task: {}` is passed explicitly so augmentation never depends on the
      // SDK's `isToolTask` cache (which only fills after listTools on this
      // client) — see the regression test below.
      expect(h.client.experimental.tasks.callToolStream).toHaveBeenCalledWith(
        { name: 'research', arguments: { topic: 'mcp' } },
        undefined,
        {
          task: {},
          onprogress: expect.any(Function),
          timeout: 30 * 60_000,
          resetTimeoutOnProgress: true
        }
      )
      // The inner result is wrapped in an envelope so the renderer parses it
      // like a plain call's response.
      expect(outcome.response).toEqual({
        jsonrpc: '2.0',
        result: { content: [{ type: 'text', text: 'done' }] }
      })
      expect(outcome.error).toBeUndefined()
    })

    it('augments with task: {} without a prior listTools on the session', async () => {
      // Regression: the SDK only auto-augments (isToolTask) after listTools has
      // populated its cache on this client. We call the tool with no preceding
      // connectServer/listTools, so the only way `task` reaches the wire is our
      // explicit option.
      h.client.experimental.tasks.callToolStream.mockImplementation(
        stream([{ type: 'result', result: { content: [] } }])
      )
      await mod.callTool(stdioConfig, 'research', {}, undefined, undefined, undefined, 'required')
      expect(h.client.listTools).not.toHaveBeenCalled()
      expect(h.client.experimental.tasks.callToolStream).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({ task: {} })
      )
    })

    it('emits synthetic lifecycle notifications from the stream frames', async () => {
      h.client.experimental.tasks.callToolStream.mockImplementation(
        stream([
          { type: 'taskCreated', task: { taskId: 't1', status: 'working' } },
          { type: 'taskStatus', task: { taskId: 't1', status: 'working' } },
          { type: 'taskStatus', task: { taskId: 't1', status: 'completed' } },
          { type: 'result', result: { content: [] } }
        ])
      )
      const received: Array<{ method: string; params?: Record<string, unknown> }> = []
      await mod.callTool(
        stdioConfig,
        'research',
        {},
        (n) => received.push(n),
        undefined,
        undefined,
        'required'
      )
      expect(received.map((n) => n.method)).toEqual([
        'tasks/created',
        'tasks/status',
        'tasks/status'
      ])
      expect(received[2].params).toEqual({ taskId: 't1', status: 'completed' })
    })

    it('wraps a terminal error frame in an error envelope', async () => {
      h.client.experimental.tasks.callToolStream.mockImplementation(
        stream([{ type: 'error', error: { code: -32000, message: 'task failed', data: { x: 1 } } }])
      )
      const outcome = await mod.callTool(
        stdioConfig,
        'research',
        {},
        undefined,
        undefined,
        undefined,
        'required'
      )
      expect(outcome.response).toEqual({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'task failed', data: { x: 1 } }
      })
      expect(outcome.error).toBeUndefined()
    })

    it('returns a transport error when the stream throws before any frame', async () => {
      h.client.experimental.tasks.callToolStream.mockImplementation(async function* () {
        throw new Error('connection lost')
        yield // unreachable, but satisfies the generator contract
      })
      const outcome = await mod.callTool(
        stdioConfig,
        'research',
        {},
        undefined,
        undefined,
        undefined,
        'required'
      )
      expect(outcome.response).toBeUndefined()
      expect(outcome.error).toBe('connection lost')
    })

    it('uses the plain call path for taskSupport "optional"', async () => {
      h.client.callTool.mockResolvedValue({ content: [] })
      await mod.callTool(stdioConfig, 'echo', {}, undefined, undefined, undefined, 'optional')
      expect(h.client.callTool).toHaveBeenCalled()
      expect(h.client.experimental.tasks.callToolStream).not.toHaveBeenCalled()
    })
  })

  describe('elicitation', () => {
    const elicitParams = {
      message: 'What is your name?',
      requestedSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }

    // The handler createSession registered for elicitation/create.
    function capturedHandler(): (
      request: unknown,
      extra: { signal: AbortSignal; taskStore?: unknown; taskRequestedTtl?: number }
    ) => Promise<unknown> {
      return handlerForSchema(schemas.ElicitRequestSchema)
    }

    it('registers a handler for the elicitation/create schema', async () => {
      await mod.callTool(stdioConfig, 'echo', {})
      expect(h.client.setRequestHandler).toHaveBeenCalledWith(
        schemas.ElicitRequestSchema,
        expect.any(Function)
      )
    })

    it('routes the request through onElicitation and returns its result', async () => {
      const onElicitation = vi.fn().mockResolvedValue({
        action: 'accept',
        content: { name: 'Ada' }
      })
      const signal = new AbortController().signal
      let result: unknown
      // The handler reads the session's active call, so it must run mid-call.
      h.client.callTool.mockImplementation(async () => {
        result = await capturedHandler()(
          { method: 'elicitation/create', params: elicitParams },
          { signal }
        )
        return { content: [] }
      })

      await mod.callTool(stdioConfig, 'echo', {}, undefined, onElicitation)

      expect(onElicitation).toHaveBeenCalledWith(elicitParams, signal)
      expect(result).toEqual({ action: 'accept', content: { name: 'Ada' } })
    })

    it('brackets the exchange with synthetic notifications', async () => {
      const received: Array<{ method: string; params?: Record<string, unknown> }> = []
      const onElicitation = vi.fn().mockResolvedValue({ action: 'decline' })
      h.client.callTool.mockImplementation(async () => {
        await capturedHandler()(
          { method: 'elicitation/create', params: elicitParams },
          { signal: new AbortController().signal }
        )
        return { content: [] }
      })

      await mod.callTool(stdioConfig, 'echo', {}, (n) => received.push(n), onElicitation)

      expect(received.map((n) => n.method)).toEqual(['elicitation/create', 'elicitation/response'])
      expect(received[0].params).toEqual(elicitParams)
      expect(received[1].params).toEqual({ action: 'decline' })
    })

    it('declines when no onElicitation callback is provided', async () => {
      let result: unknown
      h.client.callTool.mockImplementation(async () => {
        result = await capturedHandler()(
          { method: 'elicitation/create', params: elicitParams },
          { signal: new AbortController().signal }
        )
        return { content: [] }
      })
      await mod.callTool(stdioConfig, 'echo', {})
      expect(result).toEqual({ action: 'decline' })
    })

    describe('task-augmented', () => {
      const task = {
        taskId: 'task-1',
        status: 'working',
        ttl: 60_000,
        createdAt: 'now',
        lastUpdatedAt: 'now'
      }

      function mockTaskStore(): {
        createTask: ReturnType<typeof vi.fn>
        updateTaskStatus: ReturnType<typeof vi.fn>
        storeTaskResult: ReturnType<typeof vi.fn>
      } {
        return {
          createTask: vi.fn().mockResolvedValue(task),
          updateTaskStatus: vi.fn().mockResolvedValue(undefined),
          storeTaskResult: vi.fn().mockResolvedValue(undefined)
        }
      }

      it('returns the task immediately and stores the result when the user answers', async () => {
        let answer: (result: unknown) => void = () => {}
        const onElicitation = vi.fn().mockReturnValue(new Promise((resolve) => (answer = resolve)))
        const taskStore = mockTaskStore()
        let result: unknown
        h.client.callTool.mockImplementation(async () => {
          result = await capturedHandler()(
            { method: 'elicitation/create', params: { ...elicitParams, task: { ttl: 60_000 } } },
            { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
          )
          return { content: [] }
        })
        await mod.callTool(stdioConfig, 'echo', {}, undefined, onElicitation)

        // Acknowledged before the user answered, flagged as awaiting input.
        expect(taskStore.createTask).toHaveBeenCalledWith({ ttl: 60_000 })
        expect(taskStore.updateTaskStatus).toHaveBeenCalledWith('task-1', 'input_required')
        expect(result).toEqual({ task: { ...task, status: 'input_required' } })
        expect(taskStore.storeTaskResult).not.toHaveBeenCalled()

        answer({ action: 'accept', content: { name: 'Ada' } })
        await vi.waitFor(() =>
          expect(taskStore.storeTaskResult).toHaveBeenCalledWith('task-1', 'completed', {
            action: 'accept',
            content: { name: 'Ada' }
          })
        )
      })

      it('stores a failed result when the elicitation rejects', async () => {
        const onElicitation = vi.fn().mockRejectedValue(new Error('renderer gone'))
        const taskStore = mockTaskStore()
        h.client.callTool.mockImplementation(async () => {
          await capturedHandler()(
            { method: 'elicitation/create', params: { ...elicitParams, task: { ttl: 60_000 } } },
            { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
          )
          return { content: [] }
        })
        await mod.callTool(stdioConfig, 'echo', {}, undefined, onElicitation)

        await vi.waitFor(() =>
          expect(taskStore.storeTaskResult).toHaveBeenCalledWith('task-1', 'failed', {
            action: 'cancel',
            _meta: { error: 'renderer gone' }
          })
        )
      })

      it('answers inline when the request is task-augmented but no store is available', async () => {
        const onElicitation = vi.fn().mockResolvedValue({ action: 'decline' })
        let result: unknown
        h.client.callTool.mockImplementation(async () => {
          result = await capturedHandler()(
            { method: 'elicitation/create', params: { ...elicitParams, task: { ttl: 60_000 } } },
            { signal: new AbortController().signal }
          )
          return { content: [] }
        })
        await mod.callTool(stdioConfig, 'echo', {}, undefined, onElicitation)
        expect(result).toEqual({ action: 'decline' })
      })
    })
  })

  describe('sampling', () => {
    const samplingParams = {
      messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
      systemPrompt: 'Be brief.',
      maxTokens: 100
    }

    function capturedHandler(): (
      request: unknown,
      extra: { signal: AbortSignal; taskStore?: unknown; taskRequestedTtl?: number }
    ) => Promise<unknown> {
      return handlerForSchema(schemas.CreateMessageRequestSchema)
    }

    it('registers a handler for the createMessage schema', async () => {
      await mod.callTool(stdioConfig, 'echo', {})
      expect(h.client.setRequestHandler).toHaveBeenCalledWith(
        schemas.CreateMessageRequestSchema,
        expect.any(Function)
      )
    })

    it('returns the assistant message the user supplies', async () => {
      const onSampling = vi.fn().mockResolvedValue({
        action: 'accept',
        content: { type: 'text', text: 'Hi there' },
        model: 'gpt-test',
        stopReason: 'endTurn'
      })
      const signal = new AbortController().signal
      let result: unknown
      h.client.callTool.mockImplementation(async () => {
        result = await capturedHandler()(
          { method: 'sampling/createMessage', params: samplingParams },
          { signal }
        )
        return { content: [] }
      })

      await mod.callTool(stdioConfig, 'echo', {}, undefined, undefined, onSampling)

      expect(onSampling).toHaveBeenCalledWith(samplingParams, signal)
      expect(result).toEqual({
        role: 'assistant',
        content: { type: 'text', text: 'Hi there' },
        model: 'gpt-test',
        stopReason: 'endTurn'
      })
    })

    it('defaults the model name when the user omits one', async () => {
      const onSampling = vi.fn().mockResolvedValue({
        action: 'accept',
        content: { type: 'text', text: 'ok' }
      })
      let result: unknown
      h.client.callTool.mockImplementation(async () => {
        result = await capturedHandler()(
          { method: 'sampling/createMessage', params: samplingParams },
          { signal: new AbortController().signal }
        )
        return { content: [] }
      })

      await mod.callTool(stdioConfig, 'echo', {}, undefined, undefined, onSampling)

      expect(result).toMatchObject({ model: 'mcpflo-manual' })
    })

    it('brackets the exchange with synthetic notifications', async () => {
      const received: Array<{ method: string; params?: Record<string, unknown> }> = []
      const onSampling = vi.fn().mockResolvedValue({
        action: 'accept',
        content: { type: 'text', text: 'ok' }
      })
      h.client.callTool.mockImplementation(async () => {
        await capturedHandler()(
          { method: 'sampling/createMessage', params: samplingParams },
          { signal: new AbortController().signal }
        )
        return { content: [] }
      })

      await mod.callTool(stdioConfig, 'echo', {}, (n) => received.push(n), undefined, onSampling)

      expect(received.map((n) => n.method)).toEqual(['sampling/create', 'sampling/response'])
      expect(received[0].params).toEqual(samplingParams)
    })

    it('rejects with an error when the user declines', async () => {
      const onSampling = vi.fn().mockResolvedValue({ action: 'decline' })
      let error: unknown
      h.client.callTool.mockImplementation(async () => {
        try {
          await capturedHandler()(
            { method: 'sampling/createMessage', params: samplingParams },
            { signal: new AbortController().signal }
          )
        } catch (err) {
          error = err
        }
        return { content: [] }
      })

      await mod.callTool(stdioConfig, 'echo', {}, undefined, undefined, onSampling)

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(/declined by user/)
    })

    it('rejects with an error when no onSampling callback is provided', async () => {
      let error: unknown
      h.client.callTool.mockImplementation(async () => {
        try {
          await capturedHandler()(
            { method: 'sampling/createMessage', params: samplingParams },
            { signal: new AbortController().signal }
          )
        } catch (err) {
          error = err
        }
        return { content: [] }
      })

      await mod.callTool(stdioConfig, 'echo', {})

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(/No sampling handler/)
    })

    describe('task-augmented', () => {
      const task = {
        taskId: 'task-1',
        status: 'working',
        ttl: 60_000,
        createdAt: 'now',
        lastUpdatedAt: 'now'
      }

      function mockTaskStore(): {
        createTask: ReturnType<typeof vi.fn>
        updateTaskStatus: ReturnType<typeof vi.fn>
        storeTaskResult: ReturnType<typeof vi.fn>
      } {
        return {
          createTask: vi.fn().mockResolvedValue(task),
          updateTaskStatus: vi.fn().mockResolvedValue(undefined),
          storeTaskResult: vi.fn().mockResolvedValue(undefined)
        }
      }

      it('returns the task immediately and stores the completed result on accept', async () => {
        let answer: (result: unknown) => void = () => {}
        const onSampling = vi.fn().mockReturnValue(new Promise((resolve) => (answer = resolve)))
        const taskStore = mockTaskStore()
        let result: unknown
        h.client.callTool.mockImplementation(async () => {
          result = await capturedHandler()(
            {
              method: 'sampling/createMessage',
              params: { ...samplingParams, task: { ttl: 60_000 } }
            },
            { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
          )
          return { content: [] }
        })
        await mod.callTool(stdioConfig, 'echo', {}, undefined, undefined, onSampling)

        expect(taskStore.createTask).toHaveBeenCalledWith({ ttl: 60_000 })
        expect(taskStore.updateTaskStatus).toHaveBeenCalledWith('task-1', 'input_required')
        expect(result).toEqual({ task: { ...task, status: 'input_required' } })
        expect(taskStore.storeTaskResult).not.toHaveBeenCalled()

        answer({ action: 'accept', content: { type: 'text', text: 'done' }, model: 'm' })
        await vi.waitFor(() =>
          expect(taskStore.storeTaskResult).toHaveBeenCalledWith('task-1', 'completed', {
            role: 'assistant',
            content: { type: 'text', text: 'done' },
            model: 'm'
          })
        )
      })

      it('stores a failed result when the user declines', async () => {
        const onSampling = vi.fn().mockResolvedValue({ action: 'decline' })
        const taskStore = mockTaskStore()
        h.client.callTool.mockImplementation(async () => {
          await capturedHandler()(
            {
              method: 'sampling/createMessage',
              params: { ...samplingParams, task: { ttl: 60_000 } }
            },
            { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
          )
          return { content: [] }
        })
        await mod.callTool(stdioConfig, 'echo', {}, undefined, undefined, onSampling)

        await vi.waitFor(() =>
          expect(taskStore.storeTaskResult).toHaveBeenCalledWith('task-1', 'failed', {
            _meta: { error: 'Sampling declined by user' }
          })
        )
      })

      it('stores a failed result when the sampling rejects', async () => {
        const onSampling = vi.fn().mockRejectedValue(new Error('renderer gone'))
        const taskStore = mockTaskStore()
        h.client.callTool.mockImplementation(async () => {
          await capturedHandler()(
            {
              method: 'sampling/createMessage',
              params: { ...samplingParams, task: { ttl: 60_000 } }
            },
            { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
          )
          return { content: [] }
        })
        await mod.callTool(stdioConfig, 'echo', {}, undefined, undefined, onSampling)

        await vi.waitFor(() =>
          expect(taskStore.storeTaskResult).toHaveBeenCalledWith('task-1', 'failed', {
            _meta: { error: 'renderer gone' }
          })
        )
      })
    })
  })

  describe('lifecycle', () => {
    it('fetchCapabilities warms the connection and keeps it open', async () => {
      const result = await mod.fetchCapabilities(stdioConfig)
      expect(result.tools).toHaveLength(1)
      expect(h.client.close).not.toHaveBeenCalled()
    })

    it('fetchCapabilities reuses an already-warm connection', async () => {
      await mod.fetchCapabilities(stdioConfig)
      await mod.fetchCapabilities(stdioConfig)
      expect(h.client.connect).toHaveBeenCalledTimes(1)
    })

    it('disconnectServer is a no-op for an unknown id', async () => {
      await mod.disconnectServer('unknown')
      expect(h.client.close).not.toHaveBeenCalled()
    })

    it('disconnectServer swallows close failures', async () => {
      h.client.close.mockRejectedValue(new Error('already dead'))
      await mod.connectServer(stdioConfig)
      await expect(mod.disconnectServer(stdioConfig.id)).resolves.toBeUndefined()
    })

    it('disconnectAll closes every connected client', async () => {
      await mod.connectServer(stdioConfig)
      await mod.connectServer({ ...stdioConfig, id: 'srv-other' })
      h.client.close.mockClear()
      await mod.disconnectAll()
      expect(h.client.close).toHaveBeenCalledTimes(2)
    })
  })

  describe('OAuth', () => {
    // Collects auth events for the duration of one test.
    function captureAuthEvents(): import('../shared/mcp.types').AuthEvent[] {
      const events: import('../shared/mcp.types').AuthEvent[] = []
      mod.onAuthEvent((e) => events.push(e))
      return events
    }

    function unauthorized(): Error {
      return new authMod.UnauthorizedError('401')
    }

    describe('transport construction', () => {
      it('attaches an auth provider and forwards static headers', async () => {
        const headered: ServerConfig = {
          ...oauthConfig,
          transport: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            auth: 'oauth',
            oauth: {},
            headers: { 'X-Trace': '1' }
          }
        }
        await mod.connectServer(headered)
        const opts = lastTransport().opts as Record<string, unknown>
        expect(opts.authProvider).toBeDefined()
        expect(opts.requestInit).toEqual({ headers: { 'X-Trace': '1' } })
        expect(h.createOAuthProvider).toHaveBeenCalledWith(
          'srv-oauth',
          {},
          'http://127.0.0.1:51234/callback',
          expect.any(String)
        )
      })

      it('blocks the flow when OS encryption is unavailable', async () => {
        h.isSecretStorageAvailable.mockReturnValue(false)
        const outcome = await mod.callTool(oauthConfig, 'echo', {})
        expect(outcome.error).toMatch(/encryption/i)
        expect(h.startLoopbackListener).not.toHaveBeenCalled()
      })
    })

    describe('redirect port persistence', () => {
      it('persists a freshly bound ephemeral port', async () => {
        await mod.connectServer(oauthConfig)
        expect(h.startLoopbackListener).toHaveBeenCalledWith(expect.any(String), undefined)
        expect(h.saveRedirectPort).toHaveBeenCalledWith('srv-oauth', 51234)
      })

      it('reuses the persisted port without rewriting it', async () => {
        h.readOAuthState.mockResolvedValue({ redirect_port: 51234 })
        await mod.connectServer(oauthConfig)
        expect(h.startLoopbackListener).toHaveBeenCalledWith(expect.any(String), 51234)
        expect(h.saveRedirectPort).not.toHaveBeenCalled()
        expect(h.clearClientInformation).not.toHaveBeenCalled()
      })

      it('drops a DCR registration when the persisted port was taken (fallback)', async () => {
        // Persisted port 40000, but the listener fell back to 51234 — the prior
        // registration's redirect_uri now points at the wrong port, so it must be
        // cleared to force re-registration against the new redirect_uri.
        h.readOAuthState.mockResolvedValue({
          redirect_port: 40000,
          client_information: { client_id: 'registered' }
        })
        await mod.connectServer(oauthConfig)
        expect(h.saveRedirectPort).toHaveBeenCalledWith('srv-oauth', 51234)
        expect(h.clearClientInformation).toHaveBeenCalledWith('srv-oauth')
      })

      it('keeps a manual clientId registration intact on a port fallback', async () => {
        // A configured clientId isn't a DCR registration, so there's nothing to
        // invalidate even when the port changes.
        const withClientId: ServerConfig = {
          ...oauthConfig,
          transport: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            auth: 'oauth',
            oauth: { clientId: 'cid' }
          }
        }
        h.readOAuthState.mockResolvedValue({
          redirect_port: 40000,
          client_information: { client_id: 'cid' }
        })
        await mod.connectServer(withClientId)
        expect(h.saveRedirectPort).toHaveBeenCalledWith('srv-oauth', 51234)
        expect(h.clearClientInformation).not.toHaveBeenCalled()
      })
    })

    describe('handshake', () => {
      it('connects with valid tokens without opening the browser', async () => {
        const events = captureAuthEvents()
        await mod.connectServer(oauthConfig)
        expect(h.client.connect).toHaveBeenCalledTimes(1)
        expect(h.loopback.close).toHaveBeenCalledTimes(1)
        expect(lastTransport().finishAuth).not.toHaveBeenCalled()
        expect(events).toEqual([{ type: 'success', serverId: 'srv-oauth' }])
      })

      it('runs the 401 → browser → finishAuth → retry flow', async () => {
        h.client.connect.mockReset()
        h.client.connect.mockRejectedValueOnce(unauthorized()).mockResolvedValue(undefined)
        const events = captureAuthEvents()

        await mod.connectServer(oauthConfig)

        expect(lastTransport().finishAuth).toHaveBeenCalledWith('CODE')
        expect(h.client.connect).toHaveBeenCalledTimes(2)
        expect(events).toEqual([
          { type: 'pending', serverId: 'srv-oauth' },
          { type: 'success', serverId: 'srv-oauth' }
        ])
      })

      it('reports an error when the retry is still unauthorized', async () => {
        h.client.connect.mockReset()
        h.client.connect.mockRejectedValue(unauthorized())
        const events = captureAuthEvents()

        await expect(mod.connectServer(oauthConfig)).rejects.toThrow()
        expect(events).toEqual([
          { type: 'pending', serverId: 'srv-oauth' },
          { type: 'error', serverId: 'srv-oauth', reason: 'Auth failed after code exchange' }
        ])
      })

      it('reports an error and skips finishAuth when the callback never resolves', async () => {
        h.client.connect.mockReset()
        h.client.connect.mockRejectedValueOnce(unauthorized()).mockResolvedValue(undefined)
        const rejected = Promise.reject(new Error('Authorization timed out'))
        rejected.catch(() => {})
        h.loopback.result = rejected
        const events = captureAuthEvents()

        await expect(mod.connectServer(oauthConfig)).rejects.toThrow('timed out')
        expect(lastTransport().finishAuth).not.toHaveBeenCalled()
        expect(events).toEqual([
          { type: 'pending', serverId: 'srv-oauth' },
          { type: 'error', serverId: 'srv-oauth', reason: 'Authorization timed out' }
        ])
      })
    })

    describe('DCR failure heuristic', () => {
      it('reports dcr_required when registration was the only path to credentials', async () => {
        h.client.connect.mockReset()
        h.client.connect.mockRejectedValue(new Error('Incompatible auth server'))
        const events = captureAuthEvents()

        await expect(mod.connectServer(oauthConfig)).rejects.toThrow(
          'Dynamic client registration is not supported'
        )
        expect(h.loopback.close).toHaveBeenCalled()
        expect(events).toEqual([{ type: 'dcr_required', serverId: 'srv-oauth' }])
      })

      it('fetchCapabilities translates a DCR failure into an authRequired outcome', async () => {
        h.client.connect.mockReset()
        h.client.connect.mockRejectedValue(new Error('Incompatible auth server'))
        const events = captureAuthEvents()

        // No throw — the dcr_required event (which drives the recovery modal) still
        // fires, but the fetch resolves to a benign authRequired outcome so the
        // renderer shows the sign-in affordance instead of a red error.
        const result = await mod.fetchCapabilities(oauthConfig)
        expect(result).toEqual({ tools: [], resources: [], prompts: [], authRequired: true })
        expect(events).toEqual([{ type: 'dcr_required', serverId: 'srv-oauth' }])
      })

      it('treats a network error on first connect as retryable, not a DCR failure', async () => {
        h.client.connect.mockReset()
        // Offline / host unreachable: a connectivity error, not a 401 → never
        // reached registration. It must surface its raw message and open no modal.
        h.client.connect.mockRejectedValue(new Error('fetch failed'))
        const events = captureAuthEvents()

        await expect(mod.connectServer(oauthConfig)).rejects.toThrow('fetch failed')
        expect(events).toEqual([{ type: 'error', serverId: 'srv-oauth', reason: 'fetch failed' }])
      })

      it('treats a network errno (cause chain) as retryable, not a DCR failure', async () => {
        h.client.connect.mockReset()
        const wrapped = new Error('connect error')
        ;(wrapped as { cause?: unknown }).cause = Object.assign(new Error('getaddrinfo'), {
          code: 'ENOTFOUND'
        })
        h.client.connect.mockRejectedValue(wrapped)
        const events = captureAuthEvents()

        await expect(mod.connectServer(oauthConfig)).rejects.toThrow('connect error')
        expect(events).toEqual([{ type: 'error', serverId: 'srv-oauth', reason: 'connect error' }])
      })

      it('surfaces the raw error when a clientId is configured', async () => {
        const withClientId: ServerConfig = {
          ...oauthConfig,
          transport: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            auth: 'oauth',
            oauth: { clientId: 'cid' }
          }
        }
        h.client.connect.mockReset()
        h.client.connect.mockRejectedValue(new Error('network down'))
        const events = captureAuthEvents()

        await expect(mod.connectServer(withClientId)).rejects.toThrow('network down')
        expect(events).toEqual([{ type: 'error', serverId: 'srv-oauth', reason: 'network down' }])
      })
    })

    describe('operation-path auth errors', () => {
      it('flags re-auth and drops the session when a tool call is unauthorized', async () => {
        await mod.connectServer(oauthConfig) // warm a valid session
        h.client.callTool.mockRejectedValue(unauthorized())
        const events = captureAuthEvents()

        const outcome = await mod.callTool(oauthConfig, 'echo', {})

        expect(outcome).toEqual({ authRequired: true })
        expect(events).toContainEqual({ type: 'auth_required', serverId: 'srv-oauth' })
        expect(h.client.close).toHaveBeenCalled() // session torn down
      })

      it('flags re-auth when a resource read is unauthorized', async () => {
        await mod.connectServer(oauthConfig)
        h.client.readResource.mockRejectedValue(unauthorized())
        const outcome = await mod.readResource(oauthConfig, 'mem://x')
        expect(outcome).toEqual({ authRequired: true })
      })

      it('flags re-auth when a prompt get is unauthorized', async () => {
        await mod.connectServer(oauthConfig)
        h.client.getPrompt.mockRejectedValue(unauthorized())
        const outcome = await mod.getPrompt(oauthConfig, 'p', {})
        expect(outcome).toEqual({ authRequired: true })
      })
    })

    describe('authorizeServer', () => {
      it('establishes the session and reuses it on a second call', async () => {
        const events = captureAuthEvents()
        await mod.authorizeServer(oauthConfig)
        await mod.authorizeServer(oauthConfig)
        expect(h.client.connect).toHaveBeenCalledTimes(1)
        expect(events.filter((e) => e.type === 'success')).toHaveLength(1)
      })

      it('swallows a DCR failure (the dcr_required event drives the modal)', async () => {
        h.client.connect.mockReset()
        h.client.connect.mockRejectedValue(new Error('Incompatible auth server'))
        const events = captureAuthEvents()

        // Resolves rather than rejecting — no raw rejection to log in main, no
        // redundant toast in the renderer — while dcr_required still fires.
        await expect(mod.authorizeServer(oauthConfig)).resolves.toBeUndefined()
        expect(events).toEqual([{ type: 'dcr_required', serverId: 'srv-oauth' }])
      })

      it('still rejects on a non-DCR failure', async () => {
        const withClientId: ServerConfig = {
          ...oauthConfig,
          transport: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            auth: 'oauth',
            oauth: { clientId: 'cid' }
          }
        }
        h.client.connect.mockReset()
        h.client.connect.mockRejectedValue(new Error('network down'))
        await expect(mod.authorizeServer(withClientId)).rejects.toThrow('network down')
      })
    })

    it('onAuthEvent unsubscribe stops delivery', async () => {
      const events: import('../shared/mcp.types').AuthEvent[] = []
      const unsub = mod.onAuthEvent((e) => events.push(e))
      unsub()
      await mod.connectServer(oauthConfig)
      expect(events).toHaveLength(0)
    })
  })
})
