import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({ openExternal: vi.fn() }))

vi.mock('electron', () => ({
  shell: { openExternal: h.openExternal }
}))

import { openExternalSafely } from './openExternal'

describe('openExternalSafely', () => {
  beforeEach(() => {
    h.openExternal.mockReset()
  })

  it('opens https URLs', () => {
    openExternalSafely('https://example.com/authorize?x=1')
    expect(h.openExternal).toHaveBeenCalledWith('https://example.com/authorize?x=1')
  })

  it('opens http URLs to the loopback OAuth callback', () => {
    openExternalSafely('http://127.0.0.1:5173/callback')
    expect(h.openExternal).toHaveBeenCalledWith('http://127.0.0.1:5173/callback')
    openExternalSafely('http://localhost:5173/callback')
    expect(h.openExternal).toHaveBeenCalledWith('http://localhost:5173/callback')
  })

  it.each([
    'http://evil.com/phish',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'zoommtg://zoom.us/join',
    'not a url',
    ''
  ])('drops %s without calling shell.openExternal', (url) => {
    openExternalSafely(url)
    expect(h.openExternal).not.toHaveBeenCalled()
  })
})
