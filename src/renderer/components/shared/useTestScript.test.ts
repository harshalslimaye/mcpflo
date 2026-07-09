import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTestScript } from './useTestScript'

describe('useTestScript — no stubbed testing API', () => {
  it('starts with an empty, unsaved script without throwing', () => {
    expect(window.api).toBeUndefined()
    const { result } = renderHook(() => useTestScript('srv', 'tool', 'echo'))
    expect(result.current.script).toBe('')
    expect(result.current.hasScript).toBe(false)
  })
})

describe('useTestScript — with a stubbed testing API', () => {
  let getScript: ReturnType<typeof vi.fn>
  let saveScript: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getScript = vi.fn().mockResolvedValue(null)
    saveScript = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { testing: { getScript, saveScript } }
    })
  })

  afterEach(() => {
    // @ts-expect-error — test-only cleanup of a global stubbed above.
    delete window.api
    vi.useRealTimers()
  })

  it('loads the saved script for the given (serverId, kind, name) on mount', async () => {
    getScript.mockResolvedValue('test("a", function () {})')
    const { result } = renderHook(() => useTestScript('srv', 'tool', 'echo'))
    await waitFor(() => expect(getScript).toHaveBeenCalledWith('srv', 'tool', 'echo'))
    await waitFor(() => expect(result.current.script).toBe('test("a", function () {})'))
    expect(result.current.hasScript).toBe(true)
  })

  it('does not autosave the just-loaded script back to disk', async () => {
    vi.useFakeTimers()
    getScript.mockResolvedValue('test("a", function () {})')
    const { result } = renderHook(() => useTestScript('srv', 'tool', 'echo'))
    await vi.waitFor(() => expect(result.current.script).toBe('test("a", function () {})'))
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(saveScript).not.toHaveBeenCalled()
  })

  it('autosaves an edit after the debounce delay', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useTestScript('srv', 'tool', 'echo'))
    await vi.waitFor(() => expect(getScript).toHaveBeenCalled())

    act(() => {
      result.current.onChange('test("b", function () {})')
    })
    expect(saveScript).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(saveScript).toHaveBeenCalledWith('srv', 'tool', 'echo', 'test("b", function () {})')
  })

  it('flushes an unsaved edit on unmount instead of dropping it (regression)', async () => {
    // No fake timers here: the debounce window never gets a chance to fire
    // on its own — the flush-on-unmount path must save immediately instead.
    const { result, unmount } = renderHook(() => useTestScript('srv', 'tool', 'echo'))
    await waitFor(() => expect(getScript).toHaveBeenCalled())

    act(() => {
      result.current.onChange('test("fast switch", function () {})')
    })
    expect(saveScript).not.toHaveBeenCalled()

    unmount()
    expect(saveScript).toHaveBeenCalledWith(
      'srv',
      'tool',
      'echo',
      'test("fast switch", function () {})'
    )
  })

  it('does not save on unmount when the script was never edited', async () => {
    getScript.mockResolvedValue('test("a", function () {})')
    const { unmount } = renderHook(() => useTestScript('srv', 'tool', 'echo'))
    await waitFor(() => expect(getScript).toHaveBeenCalled())
    unmount()
    expect(saveScript).not.toHaveBeenCalled()
  })
})
