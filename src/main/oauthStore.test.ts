import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { OAuthTokens, OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js'
import { vi } from 'vitest'

// Mock electron once with both the app path (used by oauthStore) and a
// reversible safeStorage stand-in (used transitively via secrets.ts). The
// availability flag is toggled per test.
const h = vi.hoisted(() => ({ userData: '', available: true }))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  safeStorage: {
    isEncryptionAvailable: () => h.available,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  }
}))

import {
  readOAuthState,
  saveTokens,
  saveClientInformation,
  saveCodeVerifier,
  saveRedirectPort,
  clearClientInformation,
  clearOAuthTokens,
  clearOAuthState,
  hasOAuthTokens
} from './oauthStore'

const tokens: OAuthTokens = {
  access_token: 'access-abc',
  token_type: 'Bearer',
  refresh_token: 'refresh-xyz',
  expires_in: 3600
}

const clientInfo: OAuthClientInformation = {
  client_id: 'client-123',
  client_secret: 'secret-456'
}

beforeEach(() => {
  h.userData = mkdtempSync(join(tmpdir(), 'mcpflo-oauth-test-'))
  h.available = true
})

afterEach(() => {
  rmSync(h.userData, { recursive: true, force: true })
})

const oauthPath = (id: string): string => join(h.userData, 'servers', id, 'oauth.json')

describe('oauthStore', () => {
  it('returns null for a server with no oauth state', async () => {
    expect(await readOAuthState('nope')).toBeNull()
  })

  it('round-trips tokens with secret fields encrypted on disk', async () => {
    await saveTokens('srv-1', tokens)

    const read = await readOAuthState('srv-1')
    expect(read?.tokens).toEqual(tokens)

    // Secrets must be ciphertext in the raw file, non-secrets cleartext.
    const raw = await fs.readFile(oauthPath('srv-1'), 'utf-8')
    expect(raw).not.toContain('access-abc')
    expect(raw).not.toContain('refresh-xyz')
    expect(raw).toContain('Bearer')
  })

  it('encrypts client_secret but leaves client_id readable', async () => {
    await saveClientInformation('srv-1', clientInfo)

    expect((await readOAuthState('srv-1'))?.client_information).toEqual(clientInfo)
    const raw = await fs.readFile(oauthPath('srv-1'), 'utf-8')
    expect(raw).not.toContain('secret-456')
    expect(raw).toContain('client-123')
  })

  it('round-trips the PKCE code verifier encrypted', async () => {
    await saveCodeVerifier('srv-1', 'verifier-789')
    expect((await readOAuthState('srv-1'))?.code_verifier).toBe('verifier-789')
    const raw = await fs.readFile(oauthPath('srv-1'), 'utf-8')
    expect(raw).not.toContain('verifier-789')
  })

  it('hasOAuthTokens reflects whether issued tokens are stored', async () => {
    expect(await hasOAuthTokens('srv-1')).toBe(false)
    await saveTokens('srv-1', tokens)
    expect(await hasOAuthTokens('srv-1')).toBe(true)
    // After sign-out the tokens are gone even though client_information remains.
    await clearOAuthTokens('srv-1')
    expect(await hasOAuthTokens('srv-1')).toBe(false)
  })

  it('hasOAuthTokens is false when only client_information is stored', async () => {
    await saveClientInformation('srv-1', clientInfo)
    expect(await hasOAuthTokens('srv-1')).toBe(false)
  })

  it('stores redirect_port in cleartext', async () => {
    await saveRedirectPort('srv-1', 51234)
    expect((await readOAuthState('srv-1'))?.redirect_port).toBe(51234)
    const raw = await fs.readFile(oauthPath('srv-1'), 'utf-8')
    expect(raw).toContain('51234')
  })

  it('savers merge rather than overwrite the whole file', async () => {
    await saveClientInformation('srv-1', clientInfo)
    await saveRedirectPort('srv-1', 51234)
    await saveTokens('srv-1', tokens)

    const read = await readOAuthState('srv-1')
    expect(read?.client_information).toEqual(clientInfo)
    expect(read?.redirect_port).toBe(51234)
    expect(read?.tokens).toEqual(tokens)
  })

  it('leaves no temp file behind after a write', async () => {
    await saveTokens('srv-1', tokens)
    const files = await fs.readdir(join(h.userData, 'servers', 'srv-1'))
    expect(files).toEqual(['oauth.json'])
  })

  it('clearOAuthTokens drops tokens/verifier but preserves client_information and port', async () => {
    await saveClientInformation('srv-1', clientInfo)
    await saveRedirectPort('srv-1', 51234)
    await saveCodeVerifier('srv-1', 'verifier-789')
    await saveTokens('srv-1', tokens)

    await clearOAuthTokens('srv-1')

    const read = await readOAuthState('srv-1')
    expect(read?.tokens).toBeUndefined()
    expect(read?.code_verifier).toBeUndefined()
    expect(read?.client_information).toEqual(clientInfo)
    expect(read?.redirect_port).toBe(51234)
  })

  it('clearOAuthTokens is a no-op when nothing is stored', async () => {
    await expect(clearOAuthTokens('nope')).resolves.toBeUndefined()
    expect(await readOAuthState('nope')).toBeNull()
  })

  it('clearOAuthState wipes the file entirely', async () => {
    await saveTokens('srv-1', tokens)
    await clearOAuthState('srv-1')
    expect(await readOAuthState('srv-1')).toBeNull()
  })

  it('throws ENCRYPTION_UNAVAILABLE on write when safeStorage is unavailable', async () => {
    h.available = false
    await expect(saveTokens('srv-1', tokens)).rejects.toMatchObject({
      code: 'ENCRYPTION_UNAVAILABLE'
    })
  })

  it('throws ENCRYPTION_UNAVAILABLE on read when safeStorage is unavailable', async () => {
    await saveTokens('srv-1', tokens)
    h.available = false
    await expect(readOAuthState('srv-1')).rejects.toMatchObject({
      code: 'ENCRYPTION_UNAVAILABLE'
    })
  })

  describe('corrupt oauth.json', () => {
    // Writes a raw oauth.json bypassing encode(), to simulate a damaged or
    // hand-edited file.
    async function writeRaw(id: string, contents: string): Promise<void> {
      const dir = join(h.userData, 'servers', id)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(join(dir, 'oauth.json'), contents, 'utf-8')
    }

    it('treats malformed JSON as no saved state rather than throwing', async () => {
      await writeRaw('srv-1', '{ not valid json')
      expect(await readOAuthState('srv-1')).toBeNull()
    })

    it('treats a tokens object missing access_token as no saved state', async () => {
      // `tokens` present but its required encrypted field is absent — decode would
      // otherwise feed undefined to decryptSecret and throw a raw crypto error.
      await writeRaw('srv-1', JSON.stringify({ tokens: { token_type: 'Bearer' } }))
      expect(await readOAuthState('srv-1')).toBeNull()
    })
  })

  describe('clearClientInformation', () => {
    it('drops client_information while preserving tokens and redirect_port', async () => {
      await saveClientInformation('srv-1', clientInfo)
      await saveRedirectPort('srv-1', 51234)
      await saveTokens('srv-1', tokens)

      await clearClientInformation('srv-1')

      const read = await readOAuthState('srv-1')
      expect(read?.client_information).toBeUndefined()
      expect(read?.tokens).toEqual(tokens)
      expect(read?.redirect_port).toBe(51234)
    })

    it('is a no-op when nothing is stored', async () => {
      await expect(clearClientInformation('nope')).resolves.toBeUndefined()
      expect(await readOAuthState('nope')).toBeNull()
    })
  })
})
