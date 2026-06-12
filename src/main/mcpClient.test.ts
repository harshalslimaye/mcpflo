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
    setRequestHandler: vi.fn(),
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
      expect(h.clientCtor).toHaveBeenCalledWith(
        { name: 'mcpflo', version: '1.0.0' },
        {
          capabilities: {
            sampling: {},
            elicitation: {},
            roots: { listChanged: true },
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

    it('returns an error outcome for unsupported transports', async () => {
      const outcome = await mod.callTool(sseConfig, 'echo', {})
      expect(outcome.error).toBe('Transport "sse" not yet supported')
    })

    it('disconnects the server after the call', async () => {
      await mod.callTool(stdioConfig, 'echo', {})
      expect(h.client.close).toHaveBeenCalled()
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

    // The handler callTool registered for elicitation/create on the mock client.
    function capturedHandler(): (
      request: unknown,
      extra: { signal: AbortSignal; taskStore?: unknown; taskRequestedTtl?: number }
    ) => Promise<unknown> {
      expect(h.client.setRequestHandler).toHaveBeenCalledTimes(1)
      return h.client.setRequestHandler.mock.calls[0][1]
    }

    it('registers a handler for the elicitation/create schema', async () => {
      const { ElicitRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')
      await mod.callTool(stdioConfig, 'echo', {})
      expect(h.client.setRequestHandler).toHaveBeenCalledWith(
        ElicitRequestSchema,
        expect.any(Function)
      )
    })

    it('routes the request through onElicitation and returns its result', async () => {
      const onElicitation = vi.fn().mockResolvedValue({
        action: 'accept',
        content: { name: 'Ada' }
      })
      await mod.callTool(stdioConfig, 'echo', {}, undefined, onElicitation)

      const signal = new AbortController().signal
      const result = await capturedHandler()(
        { method: 'elicitation/create', params: elicitParams },
        { signal }
      )

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
      await mod.callTool(stdioConfig, 'echo', {})
      const result = await capturedHandler()(
        { method: 'elicitation/create', params: elicitParams },
        { signal: new AbortController().signal }
      )
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
        await mod.callTool(stdioConfig, 'echo', {}, undefined, onElicitation)

        const taskStore = mockTaskStore()
        const result = await capturedHandler()(
          { method: 'elicitation/create', params: { ...elicitParams, task: { ttl: 60_000 } } },
          { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
        )

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
        await mod.callTool(stdioConfig, 'echo', {}, undefined, onElicitation)

        const taskStore = mockTaskStore()
        await capturedHandler()(
          { method: 'elicitation/create', params: { ...elicitParams, task: { ttl: 60_000 } } },
          { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
        )

        await vi.waitFor(() =>
          expect(taskStore.storeTaskResult).toHaveBeenCalledWith('task-1', 'failed', {
            action: 'cancel',
            _meta: { error: 'renderer gone' }
          })
        )
      })

      it('answers inline when the request is task-augmented but no store is available', async () => {
        const onElicitation = vi.fn().mockResolvedValue({ action: 'decline' })
        await mod.callTool(stdioConfig, 'echo', {}, undefined, onElicitation)
        const result = await capturedHandler()(
          { method: 'elicitation/create', params: { ...elicitParams, task: { ttl: 60_000 } } },
          { signal: new AbortController().signal }
        )
        expect(result).toEqual({ action: 'decline' })
      })
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
