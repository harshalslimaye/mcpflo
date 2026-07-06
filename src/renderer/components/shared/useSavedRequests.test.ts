import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSavedRequests } from './useSavedRequests'

describe('useSavedRequests — no stubbed testing API', () => {
  it('starts with an empty, unloaded list without throwing', () => {
    expect(window.api).toBeUndefined()
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    expect(result.current.requests).toEqual([])
    expect(result.current.loaded).toBe(false)
  })
})

describe('useSavedRequests — with a stubbed testing API', () => {
  let getRequests: ReturnType<typeof vi.fn>
  let saveRequests: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getRequests = vi.fn().mockResolvedValue(null)
    saveRequests = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { testing: { getRequests, saveRequests } }
    })
  })

  afterEach(() => {
    // @ts-expect-error — test-only cleanup of a global stubbed above.
    delete window.api
    vi.useRealTimers()
  })

  it('loads the saved requests for the given (serverId, kind, name) on mount', async () => {
    const saved = { id: '1', name: 'Happy path', args: { a: 1 }, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved] })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(getRequests).toHaveBeenCalledWith('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.requests).toEqual([saved]))
    expect(result.current.loaded).toBe(true)
  })

  it('treats a null requests file as an empty list', async () => {
    getRequests.mockResolvedValue(null)
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.requests).toEqual([])
  })

  it('add() persists immediately with a generated id and matching created/updated timestamps', async () => {
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => {
      result.current.add('Happy path', { city: 'Lisbon' })
    })

    expect(result.current.requests).toHaveLength(1)
    const entry = result.current.requests[0]
    expect(entry.name).toBe('Happy path')
    expect(entry.args).toEqual({ city: 'Lisbon' })
    expect(entry.id).toBeTruthy()
    expect(entry.createdAt).toBe(entry.updatedAt)
    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', { requests: [entry] })
  })

  it('rename() persists immediately', async () => {
    const saved = { id: '1', name: 'Old', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved] })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.requests).toEqual([saved]))

    act(() => {
      result.current.rename('1', 'New name')
    })

    expect(result.current.requests[0].name).toBe('New name')
    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', {
      requests: [expect.objectContaining({ id: '1', name: 'New name' })]
    })
  })

  it('remove() persists immediately, deleting the last request', async () => {
    const saved = { id: '1', name: 'Only one', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved] })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.requests).toEqual([saved]))

    act(() => {
      result.current.remove('1')
    })

    expect(result.current.requests).toEqual([])
    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', { requests: [] })
  })

  it('updateArgs() does not persist until the debounce delay elapses', async () => {
    vi.useFakeTimers()
    const saved = { id: '1', name: 'a', args: { x: 1 }, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved] })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await vi.waitFor(() => expect(result.current.requests).toEqual([saved]))

    act(() => {
      result.current.updateArgs('1', { x: 2 })
    })
    // Local state updates immediately — the form reflects the edit right away.
    expect(result.current.requests[0].args).toEqual({ x: 2 })
    expect(saveRequests).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', {
      requests: [expect.objectContaining({ id: '1', args: { x: 2 } })]
    })
  })

  it('flushes an unsaved updateArgs edit on unmount instead of dropping it (regression)', async () => {
    // No fake timers here: the debounce window never gets a chance to fire
    // on its own — the flush-on-unmount path must save immediately instead.
    const saved = { id: '1', name: 'a', args: { x: 1 }, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved] })
    const { result, unmount } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.requests).toEqual([saved]))

    act(() => {
      result.current.updateArgs('1', { x: 2 })
    })
    expect(saveRequests).not.toHaveBeenCalled()

    unmount()
    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', {
      requests: [expect.objectContaining({ id: '1', args: { x: 2 } })]
    })
  })

  it('does not save on unmount when nothing was ever edited', async () => {
    const saved = { id: '1', name: 'a', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved] })
    const { result, unmount } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.requests).toEqual([saved]))
    unmount()
    expect(saveRequests).not.toHaveBeenCalled()
  })

  it('exposes testRequestId as undefined when the loaded file has none', async () => {
    const saved = { id: '1', name: 'a', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved] })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.testRequestId).toBeUndefined()
  })

  it('exposes the loaded testRequestId when it points at a real request', async () => {
    const saved = { id: '1', name: 'a', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved], testRequestId: '1' })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.testRequestId).toBe('1'))
  })

  it('resolves a dangling testRequestId (points at a deleted request) to undefined', async () => {
    const saved = { id: '1', name: 'a', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved], testRequestId: 'ghost' })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.testRequestId).toBeUndefined()
  })

  it('setTestRequestId marks a request and persists immediately', async () => {
    const saved = { id: '1', name: 'a', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved] })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => {
      result.current.setTestRequestId('1')
    })

    expect(result.current.testRequestId).toBe('1')
    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', {
      requests: [saved],
      testRequestId: '1'
    })
  })

  it('setTestRequestId(undefined) unmarks and persists immediately', async () => {
    const saved = { id: '1', name: 'a', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved], testRequestId: '1' })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.testRequestId).toBe('1'))

    act(() => {
      result.current.setTestRequestId(undefined)
    })

    expect(result.current.testRequestId).toBeUndefined()
    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', {
      requests: [saved],
      testRequestId: undefined
    })
  })

  it('remove() clears the mark in the same write when the marked request is deleted', async () => {
    const saved = { id: '1', name: 'a', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved], testRequestId: '1' })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.testRequestId).toBe('1'))

    act(() => {
      result.current.remove('1')
    })

    expect(result.current.testRequestId).toBeUndefined()
    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', {
      requests: [],
      testRequestId: undefined
    })
  })

  it('remove() of an unmarked request leaves the mark on a different request untouched', async () => {
    const marked = { id: '1', name: 'a', args: {}, createdAt: 1, updatedAt: 1 }
    const other = { id: '2', name: 'b', args: {}, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [marked, other], testRequestId: '1' })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.testRequestId).toBe('1'))

    act(() => {
      result.current.remove('2')
    })

    expect(result.current.testRequestId).toBe('1')
    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', {
      requests: [marked],
      testRequestId: '1'
    })
  })

  it('a debounced updateArgs write carries the current mark forward instead of dropping it', async () => {
    vi.useFakeTimers()
    const saved = { id: '1', name: 'a', args: { x: 1 }, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved], testRequestId: '1' })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await vi.waitFor(() => expect(result.current.testRequestId).toBe('1'))

    act(() => {
      result.current.updateArgs('1', { x: 2 })
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(saveRequests).toHaveBeenCalledWith('srv', 'tool', 'echo', {
      requests: [expect.objectContaining({ id: '1', args: { x: 2 } })],
      testRequestId: '1'
    })
  })

  it('an immediate action after a pending debounced edit persists the latest state and skips the redundant debounced write', async () => {
    vi.useFakeTimers()
    const saved = { id: '1', name: 'a', args: { x: 1 }, createdAt: 1, updatedAt: 1 }
    getRequests.mockResolvedValue({ requests: [saved] })
    const { result } = renderHook(() => useSavedRequests('srv', 'tool', 'echo'))
    await vi.waitFor(() => expect(result.current.requests).toEqual([saved]))

    act(() => {
      result.current.updateArgs('1', { x: 2 })
    })
    expect(saveRequests).not.toHaveBeenCalled()

    act(() => {
      result.current.rename('1', 'renamed')
    })
    // rename's immediate persist already includes the pending arg edit.
    expect(saveRequests).toHaveBeenCalledTimes(1)
    expect(saveRequests).toHaveBeenLastCalledWith('srv', 'tool', 'echo', {
      requests: [expect.objectContaining({ id: '1', name: 'renamed', args: { x: 2 } })]
    })

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    // The debounce timer scheduled by updateArgs must not fire a redundant
    // second write after rename already persisted the same state.
    expect(saveRequests).toHaveBeenCalledTimes(1)
  })
})
