import { describe, it, expect, vi, beforeEach } from 'vitest'

// A reversible safeStorage stand-in, toggled per test via the hoisted flag.
const h = vi.hoisted(() => ({ available: true }))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => h.available,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  }
}))

import { encryptSecret, decryptSecret, isSecretStorageAvailable } from './secrets'

describe('secrets', () => {
  beforeEach(() => {
    h.available = true
  })

  it('round-trips a secret', () => {
    const cipher = encryptSecret('ghp_token')
    expect(cipher).not.toContain('ghp_token')
    expect(decryptSecret(cipher)).toBe('ghp_token')
  })

  it('produces base64 output safe for JSON', () => {
    const cipher = encryptSecret('value')
    expect(cipher).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it('reports availability', () => {
    expect(isSecretStorageAvailable()).toBe(true)
    h.available = false
    expect(isSecretStorageAvailable()).toBe(false)
  })

  it('throws when encryption is unavailable', () => {
    h.available = false
    expect(() => encryptSecret('x')).toThrow('secure storage is unavailable')
    expect(() => decryptSecret('x')).toThrow('secure storage is unavailable')
  })
})
