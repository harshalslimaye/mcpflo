import { describe, it, expect } from 'vitest'
import { formatExpiry } from './formatExpiry'

describe('formatExpiry', () => {
  const now = 1_000_000_000

  it('reports a missing lifetime rather than implying permanence', () => {
    expect(formatExpiry(null, now)).toBe('No expiry reported')
  })

  it('covers the coarse buckets', () => {
    expect(formatExpiry(now - 1, now)).toBe('Expired')
    expect(formatExpiry(now, now)).toBe('Expired')
    expect(formatExpiry(now + 30 * 1000, now)).toBe('in under a minute')
    expect(formatExpiry(now + 43 * 60 * 1000, now)).toBe('in 43 min')
    expect(formatExpiry(now + (2 * 60 + 5) * 60 * 1000, now)).toBe('in 2 hr 5 min')
    expect(formatExpiry(now + 24 * 60 * 60 * 1000, now)).toBe('in 1 day')
    expect(formatExpiry(now + 3 * 24 * 60 * 60 * 1000, now)).toBe('in 3 days')
  })
})
