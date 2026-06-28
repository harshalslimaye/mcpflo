import { describe, it, expect, vi } from 'vitest'
import { ElicitRequestSchema, CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { wireSession } from './sessionWiring'
import type { ActiveCall, Session } from './types'

// The handler wireSession registered for a given server-request schema.
function handlerForSchema(
  client: { setRequestHandler: ReturnType<typeof vi.fn> },
  schema: unknown
): (
  request: unknown,
  extra: { signal: AbortSignal; taskStore?: unknown; taskRequestedTtl?: number }
) => Promise<unknown> {
  const call = client.setRequestHandler.mock.calls.find((c) => c[0] === schema)
  if (!call) throw new Error('no handler registered for schema')
  return call[1]
}

// Builds a fake client/transport/session and wires them, mirroring what
// session.ts's createSession does for a real connection.
function setup(): {
  client: { setRequestHandler: ReturnType<typeof vi.fn> }
  transport: { send: (message: unknown) => unknown; onmessage?: (message: unknown) => void }
  session: Session
} {
  const client = { setRequestHandler: vi.fn() }
  const transport = {
    send: vi.fn(),
    onmessage: undefined as ((message: unknown) => void) | undefined
  }
  const session: Session = {
    client: client as unknown as Client,
    transport: transport as unknown as Transport,
    active: null,
    queue: Promise.resolve()
  }
  wireSession(client as unknown as Client, transport as unknown as Transport, session)
  return { client, transport, session }
}

describe('sessionWiring', () => {
  describe('transport tap', () => {
    it('captures the full JSON-RPC response envelope for the active call', () => {
      const { transport, session } = setup()
      const call: ActiveCall = {}
      session.active = call

      const envelope = {
        jsonrpc: '2.0',
        id: 7,
        result: { content: [{ type: 'text', text: 'ok' }] }
      }
      transport.send({ jsonrpc: '2.0', id: 7, method: 'tools/call' })
      transport.onmessage?.(envelope)

      expect(call.requestId).toBe(7)
      expect(call.response).toEqual(envelope)
    })

    it('ignores response frames whose id does not match the active call', () => {
      const { transport, session } = setup()
      const call: ActiveCall = {}
      session.active = call

      transport.send({ jsonrpc: '2.0', id: 7, method: 'tools/call' })
      transport.onmessage?.({ jsonrpc: '2.0', id: 99, result: { content: [] } })

      expect(call.response).toBeUndefined()
    })

    it('forwards notification frames to onNotification, skipping noise', () => {
      const { transport, session } = setup()
      const received: Array<{ method: string }> = []
      const call: ActiveCall = { onNotification: (n) => received.push(n) }
      session.active = call

      // Before the tools/call request goes out: handshake traffic, dropped.
      transport.onmessage?.({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progress: 0 }
      })
      transport.send({ jsonrpc: '2.0', id: 7, method: 'tools/call' })
      transport.onmessage?.({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progressToken: 7, progress: 1, total: 5 }
      })
      transport.onmessage?.({
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: { level: 'info', data: 'step done' }
      })
      // Housekeeping methods are dropped even mid-call.
      transport.onmessage?.({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })
      transport.onmessage?.({ jsonrpc: '2.0', method: 'notifications/resources/list_changed' })
      // A server-to-client *request* (has an id) is not a notification.
      transport.onmessage?.({
        jsonrpc: '2.0',
        id: 42,
        method: 'sampling/createMessage',
        params: {}
      })

      expect(received.map((n) => n.method)).toEqual([
        'notifications/progress',
        'notifications/message'
      ])
    })

    it('chains to whatever onmessage was already on the transport before wiring', () => {
      const seen: unknown[] = []
      const client = { setRequestHandler: vi.fn() }
      const transport = {
        send: vi.fn(),
        onmessage: ((message: unknown) => seen.push(message)) as
          | ((message: unknown) => void)
          | undefined
      }
      const session: Session = {
        client: client as unknown as Client,
        transport: transport as unknown as Transport,
        active: null,
        queue: Promise.resolve()
      }
      wireSession(client as unknown as Client, transport as unknown as Transport, session)

      const message = { jsonrpc: '2.0', method: 'notifications/message', params: {} }
      transport.onmessage?.(message)
      expect(seen).toEqual([message])
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

    it('registers a handler for the elicitation/create schema', () => {
      const { client } = setup()
      expect(client.setRequestHandler).toHaveBeenCalledWith(
        ElicitRequestSchema,
        expect.any(Function)
      )
    })

    it('declines when no onElicitation callback is provided', async () => {
      const { client, session } = setup()
      session.active = {}
      const handler = handlerForSchema(client, ElicitRequestSchema)
      const result = await handler(
        { method: 'elicitation/create', params: elicitParams },
        { signal: new AbortController().signal }
      )
      expect(result).toEqual({ action: 'decline' })
    })

    it('routes the request through onElicitation and returns its result', async () => {
      const { client, session } = setup()
      const onElicitation = vi
        .fn()
        .mockResolvedValue({ action: 'accept', content: { name: 'Ada' } })
      session.active = { onElicitation }
      const signal = new AbortController().signal

      const handler = handlerForSchema(client, ElicitRequestSchema)
      const result = await handler(
        { method: 'elicitation/create', params: elicitParams },
        { signal }
      )

      expect(onElicitation).toHaveBeenCalledWith(elicitParams, signal)
      expect(result).toEqual({ action: 'accept', content: { name: 'Ada' } })
    })

    it('brackets the exchange with synthetic notifications', async () => {
      const { client, session } = setup()
      const received: Array<{ method: string; params?: Record<string, unknown> }> = []
      session.active = {
        onElicitation: vi.fn().mockResolvedValue({ action: 'decline' }),
        onNotification: (n) => received.push(n)
      }

      const handler = handlerForSchema(client, ElicitRequestSchema)
      await handler(
        { method: 'elicitation/create', params: elicitParams },
        { signal: new AbortController().signal }
      )

      expect(received.map((n) => n.method)).toEqual(['elicitation/create', 'elicitation/response'])
      expect(received[0].params).toEqual(elicitParams)
      expect(received[1].params).toEqual({ action: 'decline' })
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
        const { client, session } = setup()
        let answer: (result: unknown) => void = () => {}
        const onElicitation = vi.fn().mockReturnValue(new Promise((resolve) => (answer = resolve)))
        session.active = { onElicitation }
        const taskStore = mockTaskStore()

        const handler = handlerForSchema(client, ElicitRequestSchema)
        const result = await handler(
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
        const { client, session } = setup()
        const onElicitation = vi.fn().mockRejectedValue(new Error('renderer gone'))
        session.active = { onElicitation }
        const taskStore = mockTaskStore()

        const handler = handlerForSchema(client, ElicitRequestSchema)
        await handler(
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
        const { client, session } = setup()
        const onElicitation = vi.fn().mockResolvedValue({ action: 'decline' })
        session.active = { onElicitation }

        const handler = handlerForSchema(client, ElicitRequestSchema)
        const result = await handler(
          { method: 'elicitation/create', params: { ...elicitParams, task: { ttl: 60_000 } } },
          { signal: new AbortController().signal }
        )
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

    it('registers a handler for the createMessage schema', () => {
      const { client } = setup()
      expect(client.setRequestHandler).toHaveBeenCalledWith(
        CreateMessageRequestSchema,
        expect.any(Function)
      )
    })

    it('rejects with an error when no onSampling callback is provided', async () => {
      const { client, session } = setup()
      session.active = {}
      const handler = handlerForSchema(client, CreateMessageRequestSchema)
      await expect(
        handler(
          { method: 'sampling/createMessage', params: samplingParams },
          { signal: new AbortController().signal }
        )
      ).rejects.toThrow(/No sampling handler/)
    })

    it('returns the assistant message the user supplies', async () => {
      const { client, session } = setup()
      const onSampling = vi.fn().mockResolvedValue({
        action: 'accept',
        content: { type: 'text', text: 'Hi there' },
        model: 'gpt-test',
        stopReason: 'endTurn'
      })
      session.active = { onSampling }
      const signal = new AbortController().signal

      const handler = handlerForSchema(client, CreateMessageRequestSchema)
      const result = await handler(
        { method: 'sampling/createMessage', params: samplingParams },
        { signal }
      )

      expect(onSampling).toHaveBeenCalledWith(samplingParams, signal)
      expect(result).toEqual({
        role: 'assistant',
        content: { type: 'text', text: 'Hi there' },
        model: 'gpt-test',
        stopReason: 'endTurn'
      })
    })

    it('defaults the model name when the user omits one', async () => {
      const { client, session } = setup()
      session.active = {
        onSampling: vi.fn().mockResolvedValue({
          action: 'accept',
          content: { type: 'text', text: 'ok' }
        })
      }
      const handler = handlerForSchema(client, CreateMessageRequestSchema)
      const result = await handler(
        { method: 'sampling/createMessage', params: samplingParams },
        { signal: new AbortController().signal }
      )
      expect(result).toMatchObject({ model: 'mcpflo-manual' })
    })

    it('brackets the exchange with synthetic notifications', async () => {
      const { client, session } = setup()
      const received: Array<{ method: string; params?: Record<string, unknown> }> = []
      session.active = {
        onSampling: vi.fn().mockResolvedValue({
          action: 'accept',
          content: { type: 'text', text: 'ok' }
        }),
        onNotification: (n) => received.push(n)
      }
      const handler = handlerForSchema(client, CreateMessageRequestSchema)
      await handler(
        { method: 'sampling/createMessage', params: samplingParams },
        { signal: new AbortController().signal }
      )
      expect(received.map((n) => n.method)).toEqual(['sampling/create', 'sampling/response'])
      expect(received[0].params).toEqual(samplingParams)
    })

    it('rejects with an error when the user declines', async () => {
      const { client, session } = setup()
      session.active = { onSampling: vi.fn().mockResolvedValue({ action: 'decline' }) }
      const handler = handlerForSchema(client, CreateMessageRequestSchema)
      await expect(
        handler(
          { method: 'sampling/createMessage', params: samplingParams },
          { signal: new AbortController().signal }
        )
      ).rejects.toThrow(/declined by user/)
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
        const { client, session } = setup()
        let answer: (result: unknown) => void = () => {}
        const onSampling = vi.fn().mockReturnValue(new Promise((resolve) => (answer = resolve)))
        session.active = { onSampling }
        const taskStore = mockTaskStore()

        const handler = handlerForSchema(client, CreateMessageRequestSchema)
        const result = await handler(
          {
            method: 'sampling/createMessage',
            params: { ...samplingParams, task: { ttl: 60_000 } }
          },
          { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
        )

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
        const { client, session } = setup()
        session.active = { onSampling: vi.fn().mockResolvedValue({ action: 'decline' }) }
        const taskStore = mockTaskStore()

        const handler = handlerForSchema(client, CreateMessageRequestSchema)
        await handler(
          {
            method: 'sampling/createMessage',
            params: { ...samplingParams, task: { ttl: 60_000 } }
          },
          { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
        )

        await vi.waitFor(() =>
          expect(taskStore.storeTaskResult).toHaveBeenCalledWith('task-1', 'failed', {
            _meta: { error: 'Sampling declined by user' }
          })
        )
      })

      it('stores a failed result when the sampling rejects', async () => {
        const { client, session } = setup()
        session.active = { onSampling: vi.fn().mockRejectedValue(new Error('renderer gone')) }
        const taskStore = mockTaskStore()

        const handler = handlerForSchema(client, CreateMessageRequestSchema)
        await handler(
          {
            method: 'sampling/createMessage',
            params: { ...samplingParams, task: { ttl: 60_000 } }
          },
          { signal: new AbortController().signal, taskStore, taskRequestedTtl: 60_000 }
        )

        await vi.waitFor(() =>
          expect(taskStore.storeTaskResult).toHaveBeenCalledWith('task-1', 'failed', {
            _meta: { error: 'renderer gone' }
          })
        )
      })
    })
  })
})
