import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerConfig } from '../shared/mcp.types'

interface MockTransport {
  opts: Record<string, unknown>
  send: (message: unknown) => unknown
  onmessage: ((message: unknown) => void) | undefined
}

const h = vi.hoisted(() => ({
  client: {
    connect: vi.fn(),
    listTools: vi.fn(),
    listResources: vi.fn(),
    listPrompts: vi.fn(),
    callTool: vi.fn(),
    close: vi.fn()
  },
  clientCtor: vi.fn(),
  transports: [] as Array<{
    opts: Record<string, unknown>
    send: (message: unknown) => unknown
    onmessage: ((message: unknown) => void) | undefined
  }>
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    constructor(info: unknown) {
      h.clientCtor(info)
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

const stdioConfig: ServerConfig = {
  id: 'srv-1',
  name: 'Test Server',
  transport: { type: 'stdio', command: 'npx', args: ['-y', 'server'], env: { FOO: 'bar' } }
}

const sseConfig: ServerConfig = {
  id: 'srv-2',
  name: 'SSE Server',
  transport: { type: 'sse', url: 'https://example.com/sse' }
}

// The last transport openClient constructed — the one the current call taps.
function lastTransport(): MockTransport {
  return h.transports[h.transports.length - 1]
}

describe('mcpClient', () => {
  let mod: typeof import('./mcpClient')

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
    h.client.close.mockResolvedValue(undefined)
    vi.resetModules()
    mod = await import('./mcpClient')
  })

  describe('connectServer', () => {
    it('returns the listed tools, resources and prompts', async () => {
      const result = await mod.connectServer(stdioConfig)
      expect(result.tools).toEqual([{ name: 'echo', inputSchema: { type: 'object' } }])
      expect(result.resources).toEqual([{ uri: 'mem://x' }])
      expect(result.prompts).toEqual([])
      expect(h.clientCtor).toHaveBeenCalledWith({ name: 'mcpflo', version: '1.0.0' })
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

    it('spawns with the safe default env plus the configured vars', async () => {
      await mod.connectServer(stdioConfig)
      expect(lastTransport().opts).toEqual({
        command: 'npx',
        args: ['-y', 'server'],
        env: { PATH: '/usr/bin', FOO: 'bar' }
      })
    })

    it('rejects non-stdio transports', async () => {
      await expect(mod.connectServer(sseConfig)).rejects.toThrow(
        'Transport "sse" not yet supported'
      )
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
      expect(h.client.callTool).toHaveBeenCalledWith({ name: 'echo', arguments: { msg: 'hi' } })
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

    it('returns an error outcome for unsupported transports', async () => {
      const outcome = await mod.callTool(sseConfig, 'echo', {})
      expect(outcome.error).toBe('Transport "sse" not yet supported')
    })

    it('disconnects the server after the call', async () => {
      await mod.callTool(stdioConfig, 'echo', {})
      expect(h.client.close).toHaveBeenCalled()
    })
  })

  describe('lifecycle', () => {
    it('fetchCapabilities disconnects after fetching', async () => {
      const result = await mod.fetchCapabilities(stdioConfig)
      expect(result.tools).toHaveLength(1)
      expect(h.client.close).toHaveBeenCalled()
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
})
