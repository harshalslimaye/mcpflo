import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useErrorStore, toMessage } from './errorStore'

describe('errorStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useErrorStore.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pushError appends a toast with a unique id', () => {
    useErrorStore.getState().pushError('boom')
    useErrorStore.getState().pushError('bang')
    const { toasts } = useErrorStore.getState()
    expect(toasts.map((t) => t.message)).toEqual(['boom', 'bang'])
    expect(toasts[0].id).not.toBe(toasts[1].id)
  })

  it('auto-dismisses a toast after the TTL', () => {
    useErrorStore.getState().pushError('boom')
    expect(useErrorStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(6000)
    expect(useErrorStore.getState().toasts).toHaveLength(0)
  })

  it('dismiss removes only the targeted toast', () => {
    useErrorStore.getState().pushError('a')
    useErrorStore.getState().pushError('b')
    const [first] = useErrorStore.getState().toasts
    useErrorStore.getState().dismiss(first.id)
    expect(useErrorStore.getState().toasts.map((t) => t.message)).toEqual(['b'])
  })

  it('toMessage unwraps Error and stringifies anything else', () => {
    expect(toMessage(new Error('nope'))).toBe('nope')
    expect(toMessage('plain')).toBe('plain')
    expect(toMessage(42)).toBe('42')
  })
})
