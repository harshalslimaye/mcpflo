import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerConfig } from '../../shared/mcp.types'

interface FakeClientInstance {
  connect: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  onclose?: () => void
}

const h = vi.hoisted(() => ({
  client: {
    connect: vi.fn(),
    close: vi.fn()
  },
  clientCtor: vi.fn(),
  clientInstances: [] as FakeClientInstance[],
  createTransport: vi.fn(),
  buildOAuthTransport: vi.fn(),
  authorizeAndConnect: vi.fn(),
  emitAuth: vi.fn(),
  wireSession: vi.fn()
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    constructor(info: unknown, options?: unknown) {
      h.clientCtor(info, options)
      const instance = Object.assign(this, h.client) as unknown as FakeClientInstance
      h.clientInstances.push(instance)
      return instance
    }
  }
}))

vi.mock('@modelcontextprotocol/sdk/experimental/tasks', () => ({
  InMemoryTaskStore: class {}
}))

vi.mock('./transportFactory', () => ({ createTransport: h.createTransport }))

vi.mock('./oauthHandshake', () => ({
  buildOAuthTransport: h.buildOAuthTransport,
  authorizeAndConnect: h.authorizeAndConnect,
  emitAuth: h.emitAuth
}))

vi.mock('./sessionWiring', () => ({ wireSession: h.wireSession }))

const stdioConfig: ServerConfig = {
  id: 'srv-1',
  name: 'Test Server',
  transport: { type: 'stdio', command: 'npx', args: ['-y', 'server'] }
}

const oauthConfig: ServerConfig = {
  id: 'srv-oauth',
  name: 'OAuth Server',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp', auth: 'oauth', oauth: {} }
}

function lastClientInstance(): FakeClientInstance {
  return h.clientInstances[h.clientInstances.length - 1]
}

// Flushes every pending microtask (any depth of .then() chains), so the
// onclose hook's async cache-eviction has settled before we assert on it.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('session', () => {
  let mod: typeof import('./session')

  beforeEach(async () => {
    vi.clearAllMocks()
    h.clientInstances.length = 0
    h.client.connect.mockResolvedValue(undefined)
    h.client.close.mockResolvedValue(undefined)
    h.createTransport.mockReturnValue('plain-transport')
    h.buildOAuthTransport.mockResolvedValue({
      makeTransport: () => 'unauthorized-transport',
      loopback: { close: vi.fn() }
    })
    h.authorizeAndConnect.mockResolvedValue('authorized-transport')
    // Fresh `sessions` map per test.
    vi.resetModules()
    mod = await import('./session')
  })

  describe('getSession', () => {
    it('constructs the client with sampling/elicitation/task capabilities', async () => {
      await mod.getSession(stdioConfig)
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

    it('connects a plain transport directly for a non-OAuth config', async () => {
      const session = await mod.getSession(stdioConfig)
      expect(h.createTransport).toHaveBeenCalledWith(stdioConfig)
      expect(h.client.connect).toHaveBeenCalledWith('plain-transport', { timeout: undefined })
      expect(h.buildOAuthTransport).not.toHaveBeenCalled()
      expect(session.transport).toBe('plain-transport')
    })

    it('passes overrides.timeoutMs as the connect timeout', async () => {
      await mod.getSession({ ...stdioConfig, overrides: { timeoutMs: 5000 } })
      expect(h.client.connect).toHaveBeenCalledWith('plain-transport', { timeout: 5000 })
    })

    it('routes an OAuth config through buildOAuthTransport + authorizeAndConnect', async () => {
      const session = await mod.getSession(oauthConfig)
      expect(h.createTransport).not.toHaveBeenCalled()
      expect(h.buildOAuthTransport).toHaveBeenCalledWith(oauthConfig)
      expect(h.authorizeAndConnect).toHaveBeenCalledWith(
        oauthConfig,
        expect.anything(),
        expect.any(Function),
        expect.anything(),
        undefined
      )
      // The session must hold the transport authorizeAndConnect actually
      // connected, not the one buildOAuthTransport's factory would produce —
      // this is the fix for the OAuth retry "already started" bug.
      expect(session.transport).toBe('authorized-transport')
    })

    it('threads an abort signal into the plain connect', async () => {
      const signal = new AbortController().signal
      await mod.getSession(stdioConfig, signal)
      expect(h.client.connect).toHaveBeenCalledWith('plain-transport', {
        timeout: undefined,
        signal
      })
    })

    it('threads an abort signal into authorizeAndConnect for an OAuth config', async () => {
      const signal = new AbortController().signal
      await mod.getSession(oauthConfig, signal)
      expect(h.authorizeAndConnect).toHaveBeenCalledWith(
        oauthConfig,
        expect.anything(),
        expect.any(Function),
        expect.anything(),
        signal
      )
    })

    it('wires the session with the connected client and transport', async () => {
      const session = await mod.getSession(stdioConfig)
      expect(h.wireSession).toHaveBeenCalledWith(session.client, 'plain-transport', session)
    })

    it('spawns once and shares the in-flight connect across concurrent first callers', async () => {
      const [a, b] = await Promise.all([mod.getSession(stdioConfig), mod.getSession(stdioConfig)])
      expect(a).toBe(b)
      expect(h.clientCtor).toHaveBeenCalledTimes(1)
      expect(h.client.connect).toHaveBeenCalledTimes(1)
    })

    it('reuses the warm session on a later call instead of respawning', async () => {
      await mod.getSession(stdioConfig)
      await mod.getSession(stdioConfig)
      expect(h.client.connect).toHaveBeenCalledTimes(1)
    })

    it('spawns independently for different server ids', async () => {
      await mod.getSession(stdioConfig)
      await mod.getSession({ ...stdioConfig, id: 'srv-other' })
      expect(h.client.connect).toHaveBeenCalledTimes(2)
    })

    it('does not cache a failed connection, so the next call retries the spawn', async () => {
      h.client.connect.mockRejectedValueOnce(new Error('spawn npx ENOENT'))
      await expect(mod.getSession(stdioConfig)).rejects.toThrow('spawn npx ENOENT')

      h.client.connect.mockResolvedValueOnce(undefined)
      await expect(mod.getSession(stdioConfig)).resolves.toBeDefined()
      expect(h.client.connect).toHaveBeenCalledTimes(2)
    })

    it('drops the session when the client reports onclose, so the next call respawns', async () => {
      await mod.getSession(stdioConfig)
      lastClientInstance().onclose?.()
      await flushMicrotasks()

      h.client.connect.mockClear()
      await mod.getSession(stdioConfig)
      expect(h.client.connect).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleOperationAuthError', () => {
    it('tears down the session and flips the renderer into auth_required', async () => {
      await mod.getSession(stdioConfig)
      mod.handleOperationAuthError(stdioConfig.id)
      await flushMicrotasks()

      expect(h.client.close).toHaveBeenCalled()
      expect(h.emitAuth).toHaveBeenCalledWith({ type: 'auth_required', serverId: stdioConfig.id })
    })
  })

  describe('disconnectServer', () => {
    it('is a no-op for an unknown id', async () => {
      await mod.disconnectServer('unknown')
      expect(h.client.close).not.toHaveBeenCalled()
    })

    it('closes the client for a known id', async () => {
      await mod.getSession(stdioConfig)
      await mod.disconnectServer(stdioConfig.id)
      expect(h.client.close).toHaveBeenCalledTimes(1)
    })

    it('swallows close failures', async () => {
      h.client.close.mockRejectedValue(new Error('already dead'))
      await mod.getSession(stdioConfig)
      await expect(mod.disconnectServer(stdioConfig.id)).resolves.toBeUndefined()
    })

    it('respawns on the next getSession after a disconnect', async () => {
      await mod.getSession(stdioConfig)
      await mod.disconnectServer(stdioConfig.id)
      h.client.connect.mockClear()
      await mod.getSession(stdioConfig)
      expect(h.client.connect).toHaveBeenCalledTimes(1)
    })
  })

  describe('disconnectAll', () => {
    it('closes every connected client', async () => {
      await mod.getSession(stdioConfig)
      await mod.getSession({ ...stdioConfig, id: 'srv-other' })
      h.client.close.mockClear()
      await mod.disconnectAll()
      expect(h.client.close).toHaveBeenCalledTimes(2)
    })
  })
})
