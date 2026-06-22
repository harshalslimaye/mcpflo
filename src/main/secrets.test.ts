import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Electron's safeStorage with a reversible stand-in: encryptString tags
// the bytes, decryptString strips the tag. Lets us assert round-tripping and
// the availability/error paths without a real OS keyring.
const safeStorage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`CIPHER:${s}`)),
  decryptString: vi.fn((b: Buffer) => b.toString('utf8').replace(/^CIPHER:/, ''))
}))

vi.mock('electron', () => ({ safeStorage }))

import * as secrets from './secrets'

describe('secrets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeStorage.isEncryptionAvailable.mockReturnValue(true)
  })

  describe('isAvailable', () => {
    it('reflects safeStorage availability', () => {
      safeStorage.isEncryptionAvailable.mockReturnValue(true)
      expect(secrets.isAvailable()).toBe(true)
      safeStorage.isEncryptionAvailable.mockReturnValue(false)
      expect(secrets.isAvailable()).toBe(false)
    })

    it('returns false when safeStorage throws (app not ready)', () => {
      safeStorage.isEncryptionAvailable.mockImplementation(() => {
        throw new Error('not ready')
      })
      expect(secrets.isAvailable()).toBe(false)
    })
  })

  describe('encrypt / decrypt', () => {
    it('round-trips a value', () => {
      const enc = secrets.encrypt('ghp_supersecret')
      expect(secrets.decrypt(enc)).toBe('ghp_supersecret')
    })

    it('tags ciphertext with the versioned prefix and hides the plaintext', () => {
      const enc = secrets.encrypt('ghp_supersecret')
      expect(enc.startsWith('enc:v1:')).toBe(true)
      expect(enc).not.toContain('ghp_supersecret')
      expect(secrets.isEncrypted(enc)).toBe(true)
    })

    it('treats an untagged value as plaintext and returns it unchanged', () => {
      expect(secrets.isEncrypted('plain-token')).toBe(false)
      expect(secrets.decrypt('plain-token')).toBe('plain-token')
    })
  })
})
