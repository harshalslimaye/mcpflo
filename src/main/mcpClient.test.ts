import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { ServerConfig } from '../shared/mcp.types'
import type { Session } from './mcp/types'
import { DcrRegistrationRequiredError } from './mcp/oauthHandshake'

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  handleOperationAuthError: vi.fn(),
  disconnectServer: vi.fn(),
  disconnectAll: vi.fn(),
  callTool: vi.fn()
}))

vi.mock('./mcp/session', () => ({
  getSession: h.getSession,
  handleOperationAuthError: h.handleOperationAuthError,
  disconnectServer: h.disconnectServer,
  disconnectAll: h.disconnectAll
}))

vi.mock('./mcp/toolCalls', () => ({ callTool: h.callTool }))

// Not mocked: onAuthEvent/DcrRegistrationRequiredError are a plain EventEmitter
// and an Error subclass with no side effects, and authorizeAndConnect's own
// retry/classification logic is already covered in oauthHandshake.test.ts.
import * as mod from './mcpClient'

const config: ServerConfig = {
  id: 'srv-1',
  name: 'Test Server',
  transport: { type: 'stdio', command: 'npx', args: [] }
}

function makeFakeSession(): Session {
  return {
    client: {
      listTools: vi
        .fn()
        .mockResolvedValue({ tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }),
      listResources: vi.fn().mockResolvedValue({ resources: [{ uri: 'mem://x' }] }),
      listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
      readResource: vi.fn().mockResolvedValue({ contents: [] }),
      getPrompt: vi.fn().mockResolvedValue({ messages: [] })
    } as unknown as Session['client'],
    transport: {} as Session['transport'],
    active: null,
    queue: Promise.resolve()
  }
}

describe('mcpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('connectServer', () => {
    it('returns the listed tools, resources and prompts', async () => {
      h.getSession.mockResolvedValue(makeFakeSession())
      const result = await mod.connectServer(config)
      expect(result).toEqual({
        tools: [{ name: 'echo', inputSchema: { type: 'object' } }],
        resources: [{ uri: 'mem://x' }],
        prompts: []
      })
    })

    it('forwards the abort signal to getSession and every capability listing', async () => {
      const session = makeFakeSession()
      h.getSession.mockResolvedValue(session)
      const signal = new AbortController().signal
      await mod.connectServer(config, signal)
      expect(h.getSession).toHaveBeenCalledWith(config, signal)
      expect(session.client.listTools).toHaveBeenCalledWith(undefined, { signal })
      expect(session.client.listResources).toHaveBeenCalledWith(undefined, { signal })
      expect(session.client.listPrompts).toHaveBeenCalledWith(undefined, { signal })
    })

    it('preserves the execution.taskSupport hint on tools', async () => {
      const session = makeFakeSession()
      ;(session.client.listTools as ReturnType<typeof vi.fn>).mockResolvedValue({
        tools: [
          {
            name: 'research',
            inputSchema: { type: 'object' },
            execution: { taskSupport: 'required' }
          }
        ]
      })
      h.getSession.mockResolvedValue(session)
      const result = await mod.connectServer(config)
      expect(result.tools[0].execution).toEqual({ taskSupport: 'required' })
    })

    it('falls back to empty lists when a capability listing fails', async () => {
      const session = makeFakeSession()
      ;(session.client.listTools as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('tools not supported')
      )
      ;(session.client.listResources as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('resources not supported')
      )
      ;(session.client.listPrompts as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('prompts not supported')
      )
      h.getSession.mockResolvedValue(session)
      const result = await mod.connectServer(config)
      expect(result).toEqual({ tools: [], resources: [], prompts: [] })
    })
  })

  describe('authorizeServer', () => {
    it('establishes the session', async () => {
      h.getSession.mockResolvedValue(makeFakeSession())
      await expect(mod.authorizeServer(config)).resolves.toBeUndefined()
      expect(h.getSession).toHaveBeenCalledWith(config)
    })

    it('swallows a DCR failure (the dcr_required event drives the modal elsewhere)', async () => {
      h.getSession.mockRejectedValue(new DcrRegistrationRequiredError())
      await expect(mod.authorizeServer(config)).resolves.toBeUndefined()
    })

    it('still rejects on a non-DCR failure', async () => {
      h.getSession.mockRejectedValue(new Error('network down'))
      await expect(mod.authorizeServer(config)).rejects.toThrow('network down')
    })
  })

  describe('readResource', () => {
    it('wraps the SDK result in a synthesized JSON-RPC envelope', async () => {
      const session = makeFakeSession()
      const result = {
        contents: [{ uri: 'mem://x', mimeType: 'text/plain', text: 'hello' }]
      }
      ;(session.client.readResource as ReturnType<typeof vi.fn>).mockResolvedValue(result)
      h.getSession.mockResolvedValue(session)

      const outcome = await mod.readResource(config, 'mem://x')

      expect(outcome.response).toEqual({ jsonrpc: '2.0', result })
      expect(outcome.error).toBeUndefined()
      expect(session.client.readResource).toHaveBeenCalledWith({ uri: 'mem://x' })
    })

    it('returns authRequired when getSession itself is unauthorized', async () => {
      h.getSession.mockRejectedValue(new UnauthorizedError('401'))
      const outcome = await mod.readResource(config, 'mem://x')
      expect(outcome).toEqual({ authRequired: true })
    })

    it('returns a transport-level error when getSession fails for another reason', async () => {
      h.getSession.mockRejectedValue(new Error('spawn npx ENOENT'))
      const outcome = await mod.readResource(config, 'mem://x')
      expect(outcome).toEqual({ error: 'spawn npx ENOENT' })
    })

    it('returns a transport-level error when the read throws', async () => {
      const session = makeFakeSession()
      ;(session.client.readResource as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('resource not found')
      )
      h.getSession.mockResolvedValue(session)
      const outcome = await mod.readResource(config, 'mem://missing')
      expect(outcome).toEqual({ error: 'resource not found' })
    })

    it('flags re-auth via handleOperationAuthError when the read is unauthorized', async () => {
      const session = makeFakeSession()
      ;(session.client.readResource as ReturnType<typeof vi.fn>).mockRejectedValue(
        new UnauthorizedError('401')
      )
      h.getSession.mockResolvedValue(session)
      const outcome = await mod.readResource(config, 'mem://x')
      expect(outcome).toEqual({ authRequired: true })
      expect(h.handleOperationAuthError).toHaveBeenCalledWith(config.id)
    })
  })

  describe('getPrompt', () => {
    it('wraps the SDK result in a synthesized JSON-RPC envelope', async () => {
      const session = makeFakeSession()
      const result = {
        description: 'A greeting',
        messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }]
      }
      ;(session.client.getPrompt as ReturnType<typeof vi.fn>).mockResolvedValue(result)
      h.getSession.mockResolvedValue(session)

      const outcome = await mod.getPrompt(config, 'greet', { name: 'Ada' })

      expect(outcome.response).toEqual({ jsonrpc: '2.0', result })
      expect(outcome.error).toBeUndefined()
      expect(session.client.getPrompt).toHaveBeenCalledWith({
        name: 'greet',
        arguments: { name: 'Ada' }
      })
    })

    it('returns a transport-level error when the get throws', async () => {
      const session = makeFakeSession()
      ;(session.client.getPrompt as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('prompt not found')
      )
      h.getSession.mockResolvedValue(session)
      const outcome = await mod.getPrompt(config, 'missing', {})
      expect(outcome).toEqual({ error: 'prompt not found' })
    })

    it('flags re-auth via handleOperationAuthError when the get is unauthorized', async () => {
      const session = makeFakeSession()
      ;(session.client.getPrompt as ReturnType<typeof vi.fn>).mockRejectedValue(
        new UnauthorizedError('401')
      )
      h.getSession.mockResolvedValue(session)
      const outcome = await mod.getPrompt(config, 'p', {})
      expect(outcome).toEqual({ authRequired: true })
      expect(h.handleOperationAuthError).toHaveBeenCalledWith(config.id)
    })
  })

  describe('fetchCapabilities', () => {
    it('returns the listed tools, resources and prompts', async () => {
      h.getSession.mockResolvedValue(makeFakeSession())
      const result = await mod.fetchCapabilities(config)
      expect(result.tools).toHaveLength(1)
    })

    it('translates an UnauthorizedError into a benign authRequired outcome', async () => {
      // Auth-required conditions aren't capability failures — surfaced as a
      // benign outcome so the renderer shows the sign-in affordance instead of
      // a red error.
      h.getSession.mockRejectedValue(new UnauthorizedError('401'))
      const result = await mod.fetchCapabilities(config)
      expect(result).toEqual({ tools: [], resources: [], prompts: [], authRequired: true })
      expect(h.handleOperationAuthError).toHaveBeenCalledWith(config.id)
    })

    it('translates a DCR failure into a benign authRequired outcome', async () => {
      h.getSession.mockRejectedValue(new DcrRegistrationRequiredError())
      const result = await mod.fetchCapabilities(config)
      expect(result).toEqual({ tools: [], resources: [], prompts: [], authRequired: true })
    })

    it('rethrows any other connect failure', async () => {
      h.getSession.mockRejectedValue(new Error('Incompatible auth server'))
      await expect(mod.fetchCapabilities(config)).rejects.toThrow('Incompatible auth server')
    })
  })

  describe('re-exports', () => {
    it('callTool delegates to the toolCalls module', async () => {
      h.callTool.mockResolvedValue({ response: { jsonrpc: '2.0', result: {} } })
      const outcome = await mod.callTool(config, 'echo', {})
      expect(h.callTool).toHaveBeenCalledWith(config, 'echo', {})
      expect(outcome).toEqual({ response: { jsonrpc: '2.0', result: {} } })
    })

    it('disconnectServer delegates to the session module', async () => {
      await mod.disconnectServer('srv-1')
      expect(h.disconnectServer).toHaveBeenCalledWith('srv-1')
    })

    it('disconnectAll delegates to the session module', async () => {
      await mod.disconnectAll()
      expect(h.disconnectAll).toHaveBeenCalled()
    })

    it('onAuthEvent is the same emitter subscription oauthHandshake exposes', () => {
      // Full delivery semantics (success/pending/error/dcr_required/auth_required)
      // are covered end-to-end in oauthHandshake.test.ts; this just confirms the
      // barrel exposes a working subscribe/unsubscribe pair.
      const events: unknown[] = []
      const unsub = mod.onAuthEvent((e) => events.push(e))
      unsub()
      expect(events).toEqual([])
    })
  })
})
