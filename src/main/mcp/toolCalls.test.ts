import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { ServerConfig } from '../../shared/mcp.types'
import type { ActiveCall, Session } from './types'

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  handleOperationAuthError: vi.fn()
}))

vi.mock('./session', () => ({
  getSession: h.getSession,
  handleOperationAuthError: h.handleOperationAuthError
}))

import { callTool } from './toolCalls'

const config: ServerConfig = {
  id: 'srv-1',
  name: 'Test Server',
  transport: { type: 'stdio', command: 'npx', args: [] }
}

interface FakeSession extends Session {
  client: Session['client'] & {
    callTool: ReturnType<typeof vi.fn>
    experimental: { tasks: { callToolStream: ReturnType<typeof vi.fn> } }
  }
}

function makeSession(): FakeSession {
  return {
    client: {
      callTool: vi.fn().mockResolvedValue({ content: [] }),
      experimental: { tasks: { callToolStream: vi.fn() } }
    },
    transport: {} as Session['transport'],
    active: null,
    queue: Promise.resolve()
  } as unknown as FakeSession
}

describe('toolCalls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('callTool', () => {
    it('captures and returns the full JSON-RPC response envelope', async () => {
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      const envelope = {
        jsonrpc: '2.0',
        id: 7,
        result: { content: [{ type: 'text', text: 'ok' }] }
      }
      session.client.callTool.mockImplementation(async () => {
        // Simulates the transport tap (sessionWiring, tested separately)
        // capturing the response frame onto the active call.
        ;(session.active as ActiveCall).response = envelope
        return envelope.result
      })

      const outcome = await callTool(config, 'echo', { msg: 'hi' })

      expect(outcome.response).toEqual(envelope)
      expect(outcome.error).toBeUndefined()
      // The no-op onprogress makes the SDK attach a progressToken so servers
      // emit notifications/progress; the long timeout keeps the call alive
      // while the user answers an elicitation.
      expect(session.client.callTool).toHaveBeenCalledWith(
        { name: 'echo', arguments: { msg: 'hi' } },
        undefined,
        { onprogress: expect.any(Function), timeout: 30 * 60_000, resetTimeoutOnProgress: true }
      )
    })

    it('sets session.active for the duration of the call and clears it afterward', async () => {
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      let activeDuringCall: unknown
      session.client.callTool.mockImplementation(async () => {
        activeDuringCall = session.active
        return { content: [] }
      })

      await callTool(config, 'echo', {})

      expect(activeDuringCall).not.toBeNull()
      expect(session.active).toBeNull()
    })

    it('forwards onNotification/onElicitation/onSampling onto the active call', async () => {
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      const onNotification = vi.fn()
      const onElicitation = vi.fn()
      const onSampling = vi.fn()
      let captured: Session['active'] = null
      session.client.callTool.mockImplementation(async () => {
        captured = session.active
        return { content: [] }
      })

      await callTool(config, 'echo', {}, onNotification, onElicitation, onSampling)

      expect(captured).toMatchObject({ onNotification, onElicitation, onSampling })
    })

    it('returns the error envelope when the SDK throws after a JSON-RPC error frame', async () => {
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      const errorEnvelope = {
        jsonrpc: '2.0',
        id: 7,
        error: { code: -32602, message: 'Invalid params' }
      }
      session.client.callTool.mockImplementation(async () => {
        ;(session.active as ActiveCall).response = errorEnvelope
        throw new Error('MCP error -32602: Invalid params')
      })

      const outcome = await callTool(config, 'echo', {})

      expect(outcome.response).toEqual(errorEnvelope)
      expect(outcome.error).toBeUndefined()
    })

    it('returns a transport error when the call fails before any response', async () => {
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      session.client.callTool.mockRejectedValue(new Error('connection lost'))

      const outcome = await callTool(config, 'echo', {})

      expect(outcome.response).toBeUndefined()
      expect(outcome.error).toBe('connection lost')
    })

    it('returns authRequired when getSession itself is unauthorized', async () => {
      h.getSession.mockRejectedValue(new UnauthorizedError('401'))
      const outcome = await callTool(config, 'echo', {})
      expect(outcome).toEqual({ authRequired: true })
    })

    it('returns a pre-response error when getSession fails for another reason', async () => {
      h.getSession.mockRejectedValue(new Error('spawn npx ENOENT'))
      const outcome = await callTool(config, 'echo', {})
      expect(outcome).toEqual({ error: 'spawn npx ENOENT' })
    })

    it('flags re-auth via handleOperationAuthError when the call itself is unauthorized', async () => {
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      session.client.callTool.mockRejectedValue(new UnauthorizedError('401'))

      const outcome = await callTool(config, 'echo', {})

      expect(outcome).toEqual({ authRequired: true })
      expect(h.handleOperationAuthError).toHaveBeenCalledWith(config.id)
    })

    it('serializes calls to the same session (one active call at a time)', async () => {
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      let active = 0
      let maxConcurrent = 0
      session.client.callTool.mockImplementation(async () => {
        active++
        maxConcurrent = Math.max(maxConcurrent, active)
        await Promise.resolve()
        active--
        return { content: [] }
      })

      await Promise.all([callTool(config, 'echo', {}), callTool(config, 'echo', {})])

      expect(maxConcurrent).toBe(1)
    })

    it('keeps the serialization chain alive even when a call fails', async () => {
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      session.client.callTool
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue({ content: [] })

      const first = await callTool(config, 'echo', {})
      const second = await callTool(config, 'echo', {})

      expect(first.error).toBe('boom')
      expect(second.error).toBeUndefined()
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
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      session.client.experimental.tasks.callToolStream.mockImplementation(
        stream([{ type: 'result', result: { content: [{ type: 'text', text: 'done' }] } }])
      )

      const outcome = await callTool(
        config,
        'research',
        { topic: 'mcp' },
        undefined,
        undefined,
        undefined,
        'required'
      )

      expect(session.client.callTool).not.toHaveBeenCalled()
      // `task: {}` is passed explicitly so augmentation never depends on the
      // SDK's `isToolTask` cache (which only fills after listTools on this
      // client).
      expect(session.client.experimental.tasks.callToolStream).toHaveBeenCalledWith(
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

    it('emits synthetic lifecycle notifications from the stream frames', async () => {
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      session.client.experimental.tasks.callToolStream.mockImplementation(
        stream([
          { type: 'taskCreated', task: { taskId: 't1', status: 'working' } },
          { type: 'taskStatus', task: { taskId: 't1', status: 'working' } },
          { type: 'taskStatus', task: { taskId: 't1', status: 'completed' } },
          { type: 'result', result: { content: [] } }
        ])
      )
      const received: Array<{ method: string; params?: Record<string, unknown> }> = []

      await callTool(
        config,
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
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      session.client.experimental.tasks.callToolStream.mockImplementation(
        stream([{ type: 'error', error: { code: -32000, message: 'task failed', data: { x: 1 } } }])
      )

      const outcome = await callTool(
        config,
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
      const session = makeSession()
      h.getSession.mockResolvedValue(session)
      session.client.experimental.tasks.callToolStream.mockImplementation(async function* () {
        throw new Error('connection lost')
        yield // unreachable, but satisfies the generator contract
      })

      const outcome = await callTool(
        config,
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
      const session = makeSession()
      h.getSession.mockResolvedValue(session)

      await callTool(config, 'echo', {}, undefined, undefined, undefined, 'optional')

      expect(session.client.callTool).toHaveBeenCalled()
      expect(session.client.experimental.tasks.callToolStream).not.toHaveBeenCalled()
    })
  })
})
