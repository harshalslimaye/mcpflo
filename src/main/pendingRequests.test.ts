import { describe, it, expect } from 'vitest'
import { createPendingRegistry } from './pendingRequests'

interface Answer {
  action: 'accept' | 'decline' | 'cancel'
  content?: { name: string }
}

function makeRegistry(): ReturnType<typeof createPendingRegistry<Answer>> {
  return createPendingRegistry<Answer>({ action: 'cancel' })
}

describe('pendingRequests', () => {
  it('resolves a pending request with the supplied result', async () => {
    const reg = makeRegistry()
    const { requestId, promise } = reg.createPending('call-1')
    expect(reg.resolvePending(requestId, { action: 'accept', content: { name: 'Ada' } })).toBe(true)
    await expect(promise).resolves.toEqual({ action: 'accept', content: { name: 'Ada' } })
  })

  it('returns false for an unknown id', () => {
    const reg = makeRegistry()
    expect(reg.resolvePending('nope', { action: 'cancel' })).toBe(false)
  })

  it('returns false on a second resolve of the same id', async () => {
    const reg = makeRegistry()
    const { requestId, promise } = reg.createPending('call-1')
    expect(reg.resolvePending(requestId, { action: 'decline' })).toBe(true)
    expect(reg.resolvePending(requestId, { action: 'accept' })).toBe(false)
    await expect(promise).resolves.toEqual({ action: 'decline' })
  })

  it('cancelPendingForCall cancels only that call and reports the ids', async () => {
    const reg = makeRegistry()
    const a = reg.createPending('call-1')
    const b = reg.createPending('call-1')
    const other = reg.createPending('call-2')

    const cancelled = reg.cancelPendingForCall('call-1')
    expect(cancelled.sort()).toEqual([a.requestId, b.requestId].sort())
    await expect(a.promise).resolves.toEqual({ action: 'cancel' })
    await expect(b.promise).resolves.toEqual({ action: 'cancel' })

    // The other call's request is untouched and still answerable.
    expect(reg.resolvePending(other.requestId, { action: 'accept' })).toBe(true)
    await expect(other.promise).resolves.toEqual({ action: 'accept' })
  })

  it('cancelPendingForCall is empty when nothing is pending', () => {
    const reg = makeRegistry()
    expect(reg.cancelPendingForCall('call-x')).toEqual([])
  })

  it('uses the registry-specific cancel value', async () => {
    const reg = createPendingRegistry<Answer>({ action: 'decline' })
    const { promise } = reg.createPending('call-1')
    reg.cancelPendingForCall('call-1')
    await expect(promise).resolves.toEqual({ action: 'decline' })
  })

  it('keeps separate registries independent', () => {
    const a = makeRegistry()
    const b = makeRegistry()
    a.createPending('call-1')
    // call-1 lives in `a`, not `b`, so `b` has nothing to cancel.
    expect(b.cancelPendingForCall('call-1')).toEqual([])
  })
})
