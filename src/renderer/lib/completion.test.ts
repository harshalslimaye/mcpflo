import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CompletionRequest } from './completion'
import type { CompletionOutcome } from '../../shared/mcp.types'

const mockComplete =
  vi.fn<
    (
      serverId: string,
      ref: unknown,
      argument: { name: string; value: string },
      context?: { arguments?: Record<string, string> }
    ) => Promise<CompletionOutcome>
  >()

Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true })
;(globalThis as Record<string, unknown>).api = { mcp: { complete: mockComplete } }

const baseRequest: CompletionRequest = {
  serverId: 'srv-1',
  ref: { type: 'ref/prompt', name: 'completable-prompt' },
  argName: 'department',
  value: 'Eng'
}

describe('completion', () => {
  let requestCompletion: typeof import('./completion').requestCompletion
  let clearCompletionCache: typeof import('./completion').clearCompletionCache
  let COMPLETION_TTL_MS: number

  beforeEach(async () => {
    mockComplete.mockReset()
    // Module-level cache/in-flight state must not leak across tests.
    vi.resetModules()
    const mod = await import('./completion')
    requestCompletion = mod.requestCompletion
    clearCompletionCache = mod.clearCompletionCache
    COMPLETION_TTL_MS = mod.COMPLETION_TTL_MS
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serves a repeated identical request from cache without a second IPC call', async () => {
    mockComplete.mockResolvedValue({ values: ['Engineering'] })

    const first = await requestCompletion(baseRequest)
    const second = await requestCompletion(baseRequest)

    expect(first).toEqual({ values: ['Engineering'] })
    expect(second).toEqual({ values: ['Engineering'] })
    expect(mockComplete).toHaveBeenCalledTimes(1)
  })

  it('re-fetches once the cached entry is older than the TTL', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    mockComplete.mockResolvedValue({ values: ['Engineering'] })

    await requestCompletion(baseRequest)
    vi.setSystemTime(COMPLETION_TTL_MS + 1)
    await requestCompletion(baseRequest)

    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('treats requests with different contextArgs as distinct cache entries', async () => {
    mockComplete.mockResolvedValue({ values: ['Alice'] })
    const nameArg = { ...baseRequest, argName: 'name', value: '' }

    await requestCompletion({ ...nameArg, contextArgs: { department: 'Engineering' } })
    await requestCompletion({ ...nameArg, contextArgs: { department: 'Sales' } })
    // Same context repeated should still hit the cache, not fetch a third time.
    await requestCompletion({ ...nameArg, contextArgs: { department: 'Engineering' } })

    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('shares one IPC call between concurrent identical requests', async () => {
    let resolveFn: ((outcome: CompletionOutcome) => void) | undefined
    mockComplete.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve
        })
    )

    const first = requestCompletion(baseRequest)
    const second = requestCompletion(baseRequest)
    resolveFn?.({ values: ['Engineering'] })
    const [a, b] = await Promise.all([first, second])

    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ values: ['Engineering'] })
    expect(b).toEqual({ values: ['Engineering'] })
  })

  it('does not cache an error outcome — the next identical request re-fetches', async () => {
    mockComplete
      .mockResolvedValueOnce({ values: [], error: 'timeout' })
      .mockResolvedValueOnce({ values: ['Engineering'] })

    const first = await requestCompletion(baseRequest)
    const second = await requestCompletion(baseRequest)

    expect(first).toEqual({ values: [], error: 'timeout' })
    expect(second).toEqual({ values: ['Engineering'] })
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('caches an unsupported outcome even though it carries no values', async () => {
    mockComplete.mockResolvedValue({ values: [], unsupported: true })

    await requestCompletion(baseRequest)
    await requestCompletion(baseRequest)

    expect(mockComplete).toHaveBeenCalledTimes(1)
  })

  it('evicts the oldest entry once the cache reaches its 200-entry cap', async () => {
    mockComplete.mockResolvedValue({ values: ['x'] })
    for (let i = 0; i < 200; i++) {
      await requestCompletion({ ...baseRequest, value: `v${i}` })
    }
    // A 201st distinct entry evicts the oldest (v0) to make room.
    await requestCompletion({ ...baseRequest, value: 'v200' })
    mockComplete.mockClear()

    await requestCompletion({ ...baseRequest, value: 'v0' })
    expect(mockComplete).toHaveBeenCalledTimes(1) // evicted → re-fetched

    mockComplete.mockClear()
    await requestCompletion({ ...baseRequest, value: 'v199' })
    expect(mockComplete).toHaveBeenCalledTimes(0) // still cached
  })

  describe('clearCompletionCache', () => {
    it('scoped to one server id leaves other servers cached', async () => {
      mockComplete.mockResolvedValue({ values: ['x'] })
      const reqA = { ...baseRequest, serverId: 'srv-a' }
      const reqB = { ...baseRequest, serverId: 'srv-b' }
      await requestCompletion(reqA)
      await requestCompletion(reqB)
      mockComplete.mockClear()

      clearCompletionCache('srv-a')
      await requestCompletion(reqA)
      await requestCompletion(reqB)

      expect(mockComplete).toHaveBeenCalledTimes(1)
    })

    it('called with no id clears every server', async () => {
      mockComplete.mockResolvedValue({ values: ['x'] })
      const reqA = { ...baseRequest, serverId: 'srv-a' }
      const reqB = { ...baseRequest, serverId: 'srv-b' }
      await requestCompletion(reqA)
      await requestCompletion(reqB)
      mockComplete.mockClear()

      clearCompletionCache()
      await requestCompletion(reqA)
      await requestCompletion(reqB)

      expect(mockComplete).toHaveBeenCalledTimes(2)
    })
  })
})
