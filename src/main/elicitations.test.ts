import { describe, it, expect } from 'vitest'
import { createPending, resolvePending, cancelPendingForCall } from './elicitations'

describe('elicitations', () => {
  it('resolves a pending elicitation with the supplied result', async () => {
    const { elicitationId, promise } = createPending('call-1')
    expect(resolvePending(elicitationId, { action: 'accept', content: { name: 'Ada' } })).toBe(true)
    await expect(promise).resolves.toEqual({ action: 'accept', content: { name: 'Ada' } })
  })

  it('returns false for an unknown id', () => {
    expect(resolvePending('nope', { action: 'cancel' })).toBe(false)
  })

  it('returns false on a second resolve of the same id', async () => {
    const { elicitationId, promise } = createPending('call-1')
    expect(resolvePending(elicitationId, { action: 'decline' })).toBe(true)
    expect(resolvePending(elicitationId, { action: 'accept' })).toBe(false)
    await expect(promise).resolves.toEqual({ action: 'decline' })
  })

  it('cancelPendingForCall cancels only that call and reports the ids', async () => {
    const a = createPending('call-1')
    const b = createPending('call-1')
    const other = createPending('call-2')

    const cancelled = cancelPendingForCall('call-1')
    expect(cancelled.sort()).toEqual([a.elicitationId, b.elicitationId].sort())
    await expect(a.promise).resolves.toEqual({ action: 'cancel' })
    await expect(b.promise).resolves.toEqual({ action: 'cancel' })

    // The other call's elicitation is untouched and still answerable.
    expect(resolvePending(other.elicitationId, { action: 'accept' })).toBe(true)
    await expect(other.promise).resolves.toEqual({ action: 'accept' })
  })

  it('cancelPendingForCall is empty when nothing is pending', () => {
    expect(cancelPendingForCall('call-x')).toEqual([])
  })
})
