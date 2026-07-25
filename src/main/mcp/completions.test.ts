import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { ServerConfig, CompletionRef } from '../../shared/mcp.types'
import type { Session } from './types'

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  handleOperationAuthError: vi.fn()
}))

vi.mock('./session', () => ({
  getSession: h.getSession,
  handleOperationAuthError: h.handleOperationAuthError
}))

import { completeArgument } from './completions'

const config: ServerConfig = {
  id: 'srv-1',
  name: 'Test Server',
  transport: { type: 'stdio', command: 'npx', args: [] }
}

const promptRef: CompletionRef = { type: 'ref/prompt', name: 'completable-prompt' }

function makeSession(serverCapabilities?: Record<string, unknown>): Session {
  return {
    client: {
      getServerCapabilities: vi.fn().mockReturnValue(serverCapabilities),
      complete: vi.fn().mockResolvedValue({ completion: { values: [] } })
    } as unknown as Session['client'],
    transport: {} as Session['transport'],
    active: null,
    queue: Promise.resolve()
  }
}

// Advances the microtask queue enough ticks for a chain of already-resolved
// awaits (getSession → capability check → complete) to settle before the
// next assertion or call runs.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('completeArgument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns unsupported without calling complete when the server has no completions capability', async () => {
    const session = makeSession(undefined)
    h.getSession.mockResolvedValue(session)

    const outcome = await completeArgument(config, promptRef, {
      name: 'department',
      value: 'Eng'
    })

    expect(outcome).toEqual({ values: [], unsupported: true })
    expect(session.client.complete).not.toHaveBeenCalled()
  })

  it('sends ref/argument, omits empty context, and maps values/total/hasMore through', async () => {
    const session = makeSession({ completions: {} })
    ;(session.client.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      completion: { values: ['Engineering'], total: 1, hasMore: false }
    })
    h.getSession.mockResolvedValue(session)

    const outcome = await completeArgument(
      config,
      promptRef,
      { name: 'department', value: 'Eng' },
      { arguments: {} }
    )

    expect(outcome).toEqual({ values: ['Engineering'], total: 1, hasMore: false })
    expect(session.client.complete).toHaveBeenCalledWith(
      { ref: promptRef, argument: { name: 'department', value: 'Eng' } },
      { signal: expect.any(AbortSignal), timeout: 5000 }
    )
  })

  it('includes context on the wire when it has non-empty entries', async () => {
    const session = makeSession({ completions: {} })
    ;(session.client.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      completion: { values: ['Alice'] }
    })
    h.getSession.mockResolvedValue(session)

    await completeArgument(
      config,
      promptRef,
      { name: 'name', value: '' },
      { arguments: { department: 'Engineering' } }
    )

    expect(session.client.complete).toHaveBeenCalledWith(
      {
        ref: promptRef,
        argument: { name: 'name', value: '' },
        context: { arguments: { department: 'Engineering' } }
      },
      { signal: expect.any(AbortSignal), timeout: 5000 }
    )
  })

  it('clamps values to 100', async () => {
    const session = makeSession({ completions: {} })
    const many = Array.from({ length: 150 }, (_, i) => `v${i}`)
    ;(session.client.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      completion: { values: many }
    })
    h.getSession.mockResolvedValue(session)

    const outcome = await completeArgument(config, promptRef, { name: 'department', value: '' })

    expect(outcome.values).toHaveLength(100)
    expect(outcome.values).toEqual(many.slice(0, 100))
  })

  it('returns a transport error when getSession fails', async () => {
    h.getSession.mockRejectedValue(new Error('spawn npx ENOENT'))

    const outcome = await completeArgument(config, promptRef, { name: 'department', value: '' })

    expect(outcome).toEqual({ values: [], error: 'spawn npx ENOENT' })
  })

  it('returns authRequired when getSession itself is unauthorized', async () => {
    h.getSession.mockRejectedValue(new UnauthorizedError('401'))

    const outcome = await completeArgument(config, promptRef, { name: 'department', value: '' })

    expect(outcome).toEqual({ values: [], authRequired: true })
  })

  it('flags re-auth via handleOperationAuthError when the request itself is unauthorized', async () => {
    const session = makeSession({ completions: {} })
    ;(session.client.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError('401')
    )
    h.getSession.mockResolvedValue(session)

    const outcome = await completeArgument(config, promptRef, { name: 'department', value: '' })

    expect(outcome).toEqual({ values: [], authRequired: true })
    expect(h.handleOperationAuthError).toHaveBeenCalledWith(config.id)
    expect(h.handleOperationAuthError).toHaveBeenCalledTimes(1)
  })

  it('passes a 5s timeout', async () => {
    const session = makeSession({ completions: {} })
    h.getSession.mockResolvedValue(session)

    await completeArgument(config, promptRef, { name: 'department', value: '' })

    expect(session.client.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 5000 })
    )
  })

  it('aborts an in-flight request for the same field when a new one arrives', async () => {
    const session = makeSession({ completions: {} })
    let capturedSignal: AbortSignal | undefined
    ;(session.client.complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_params: unknown, options: { signal: AbortSignal }) => {
        capturedSignal ??= options.signal
        return new Promise(() => {}) // never resolves — simulates a slow server
      }
    )
    h.getSession.mockResolvedValue(session)

    void completeArgument(config, promptRef, { name: 'department', value: 'E' })
    await flushMicrotasks()
    void completeArgument(config, promptRef, { name: 'department', value: 'En' })
    await flushMicrotasks()

    expect(capturedSignal?.aborted).toBe(true)
  })

  it('does not abort an in-flight request for a different field', async () => {
    const session = makeSession({ completions: {} })
    const signals: AbortSignal[] = []
    ;(session.client.complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_params: unknown, options: { signal: AbortSignal }) => {
        signals.push(options.signal)
        return new Promise(() => {})
      }
    )
    h.getSession.mockResolvedValue(session)

    void completeArgument(config, promptRef, { name: 'department', value: 'E' })
    await flushMicrotasks()
    void completeArgument(config, promptRef, { name: 'name', value: 'A' })
    await flushMicrotasks()

    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(false)
    expect(signals[1].aborted).toBe(false)
  })
})
