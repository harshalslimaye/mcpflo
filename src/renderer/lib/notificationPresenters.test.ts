import { describe, it, expect } from 'vitest'
import { presentNotification } from './notificationPresenters'

function n(
  method: string,
  params?: Record<string, unknown>
): Parameters<typeof presentNotification>[0] {
  return { method, params, at: 1700000000000 }
}

describe('presentNotification', () => {
  describe('progress', () => {
    it('summarizes progress with total and message', () => {
      const p = presentNotification(
        n('notifications/progress', { progress: 2, total: 5, message: 'halfway-ish' })
      )
      expect(p.badge).toBe('progress')
      expect(p.badgeClass).toBe('text-accent')
      expect(p.summary).toBe('2 / 5 — halfway-ish')
    })

    it('handles progress without a total', () => {
      const p = presentNotification(n('notifications/progress', { progress: 3 }))
      expect(p.summary).toBe('3')
    })

    it('handles a progress frame with no params', () => {
      const p = presentNotification(n('notifications/progress'))
      expect(p.summary).toBe('')
    })
  })

  describe('message', () => {
    it('summarizes a log message with logger and string data', () => {
      const p = presentNotification(
        n('notifications/message', { level: 'warning', logger: 'sim', data: 'something odd' })
      )
      expect(p.badge).toBe('warning')
      expect(p.badgeClass).toBe('text-amber-500')
      expect(p.summary).toBe('sim · something odd')
    })

    it('stringifies non-string data and defaults the level to info', () => {
      const p = presentNotification(n('notifications/message', { data: { step: 3 } }))
      expect(p.badge).toBe('info')
      expect(p.summary).toBe('{"step":3}')
    })

    it('produces an empty summary when data is absent', () => {
      const p = presentNotification(n('notifications/message', { level: 'debug' }))
      expect(p.summary).toBe('')
    })

    it('falls back to muted styling for an unknown level', () => {
      const p = presentNotification(n('notifications/message', { level: 'verbose', data: 'x' }))
      expect(p.badgeClass).toBe('text-text-muted')
    })
  })

  it('summarizes a resource update with its uri', () => {
    const p = presentNotification(n('notifications/resources/updated', { uri: 'demo://x' }))
    expect(p.badge).toBe('resource updated')
    expect(p.summary).toBe('demo://x')
  })

  it('produces an empty summary for a resource update with no uri', () => {
    const p = presentNotification(n('notifications/resources/updated', {}))
    expect(p.summary).toBe('')
  })

  it('summarizes a cancellation with its reason', () => {
    const p = presentNotification(n('notifications/cancelled', { reason: 'timeout' }))
    expect(p.badge).toBe('cancelled')
    expect(p.summary).toBe('timeout')
  })

  it('produces an empty summary for a cancellation with no reason', () => {
    const p = presentNotification(n('notifications/cancelled', {}))
    expect(p.summary).toBe('')
  })

  describe('fallback', () => {
    it('uses the method (sans prefix) as badge and raw params as summary', () => {
      const p = presentNotification(n('notifications/something/new', { a: 1 }))
      expect(p.badge).toBe('something/new')
      expect(p.badgeClass).toBe('text-text-muted')
      expect(p.summary).toBe('{"a":1}')
    })

    it('handles unknown methods without params', () => {
      const p = presentNotification(n('weird/method'))
      expect(p.badge).toBe('weird/method')
      expect(p.summary).toBe('')
    })
  })
})
