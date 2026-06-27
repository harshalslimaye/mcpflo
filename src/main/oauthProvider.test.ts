import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Mock electron: shell.openExternal is asserted directly; app.getPath +
// safeStorage back oauthStore (used by the provider's persistence methods).
const h = vi.hoisted(() => ({ userData: '', openExternal: vi.fn() }))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  shell: { openExternal: h.openExternal },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  }
}))

import {
  startLoopbackListener,
  createOAuthProvider,
  CALLBACK_TIMEOUT_MS,
  type LoopbackListener
} from './oauthProvider'
import { saveClientInformation } from './oauthStore'

const callback = (port: number, params: Record<string, string>): string =>
  `http://127.0.0.1:${port}/callback?${new URLSearchParams(params)}`

beforeEach(() => {
  h.userData = mkdtempSync(join(tmpdir(), 'mcpflo-provider-test-'))
  h.openExternal.mockReset()
})

afterEach(() => {
  rmSync(h.userData, { recursive: true, force: true })
})

describe('startLoopbackListener', () => {
  let lb: LoopbackListener | undefined

  afterEach(() => {
    lb?.close()
    lb = undefined
  })

  it('binds an ephemeral port and resolves the code on a valid callback', async () => {
    lb = await startLoopbackListener('the-state')
    expect(lb.port).toBeGreaterThan(0)

    const res = await fetch(callback(lb.port, { code: 'auth-code', state: 'the-state' }))
    expect(res.status).toBe(200)
    await expect(lb.result).resolves.toEqual({ code: 'auth-code' })
  })

  it('rejects on a state mismatch', async () => {
    lb = await startLoopbackListener('expected')
    const rejection = expect(lb.result).rejects.toThrow('state mismatch')
    await fetch(callback(lb.port, { code: 'auth-code', state: 'forged' }))
    await rejection
  })

  it('rejects when the callback carries an error param', async () => {
    lb = await startLoopbackListener('the-state')
    const rejection = expect(lb.result).rejects.toThrow('access_denied')
    await fetch(callback(lb.port, { error: 'access_denied', state: 'the-state' }))
    await rejection
  })

  it('close() tears down the server without firing the timeout', async () => {
    vi.useFakeTimers()
    try {
      const listener = await startLoopbackListener('the-state')
      const settled = vi.fn()
      listener.result.then(settled, settled)

      listener.close()
      vi.advanceTimersByTime(CALLBACK_TIMEOUT_MS * 2)
      await Promise.resolve()

      expect(settled).not.toHaveBeenCalled()
      await expect(
        fetch(callback(listener.port, { code: 'x', state: 'the-state' }))
      ).rejects.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects result after the callback timeout', async () => {
    vi.useFakeTimers()
    try {
      const listener = await startLoopbackListener('the-state')
      const rejection = expect(listener.result).rejects.toThrow('timed out')
      vi.advanceTimersByTime(CALLBACK_TIMEOUT_MS)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to an ephemeral port when the requested port is in use', async () => {
    const first = await startLoopbackListener('s1')
    try {
      lb = await startLoopbackListener('s2', first.port)
      expect(lb.port).not.toBe(first.port)
      expect(lb.port).toBeGreaterThan(0)
    } finally {
      first.close()
    }
  })
})

describe('createOAuthProvider', () => {
  const redirectUrl = 'http://127.0.0.1:51234/callback'

  it('exposes the redirect URL and OAuth state', () => {
    const p = createOAuthProvider('srv-1', {}, redirectUrl, 'the-state')
    expect(p.redirectUrl).toBe(redirectUrl)
    expect(p.state?.()).toBe('the-state')
  })

  it('builds public-client metadata when no client secret is configured', () => {
    const p = createOAuthProvider('srv-1', { scope: 'read:tools' }, redirectUrl, 'st')
    const meta = p.clientMetadata
    expect(meta.redirect_uris).toEqual([redirectUrl])
    expect(meta.grant_types).toEqual(['authorization_code', 'refresh_token'])
    expect(meta.token_endpoint_auth_method).toBe('none')
    expect(meta.scope).toBe('read:tools')
  })

  it('uses client_secret_basic and omits scope when unset', () => {
    const p = createOAuthProvider('srv-1', { clientSecret: 'shh' }, redirectUrl, 'st')
    const meta = p.clientMetadata
    expect(meta.token_endpoint_auth_method).toBe('client_secret_basic')
    expect('scope' in meta).toBe(false)
  })

  it('redirectToAuthorization opens the URL in the system browser', () => {
    const p = createOAuthProvider('srv-1', {}, redirectUrl, 'st')
    p.redirectToAuthorization(new URL('https://auth.example.com/authorize?x=1'))
    expect(h.openExternal).toHaveBeenCalledWith('https://auth.example.com/authorize?x=1')
  })

  it('returns configured client credentials, preferring them over DCR', async () => {
    const p = createOAuthProvider(
      'srv-1',
      { clientId: 'cid', clientSecret: 'sec' },
      redirectUrl,
      'st'
    )
    expect(await p.clientInformation()).toEqual({ client_id: 'cid', client_secret: 'sec' })
  })

  it('falls back to persisted DCR client information when no clientId is configured', async () => {
    await saveClientInformation('srv-1', { client_id: 'registered', client_secret: 'issued' })
    const p = createOAuthProvider('srv-1', {}, redirectUrl, 'st')
    expect(await p.clientInformation()).toEqual({
      client_id: 'registered',
      client_secret: 'issued'
    })
  })

  it('returns undefined client information when nothing is configured or registered', async () => {
    const p = createOAuthProvider('srv-1', {}, redirectUrl, 'st')
    expect(await p.clientInformation()).toBeUndefined()
  })

  it('round-trips tokens through the store', async () => {
    const p = createOAuthProvider('srv-1', {}, redirectUrl, 'st')
    expect(await p.tokens()).toBeUndefined()
    await p.saveTokens({ access_token: 'tok', token_type: 'Bearer' })
    expect(await p.tokens()).toEqual({ access_token: 'tok', token_type: 'Bearer' })
  })

  it('round-trips the PKCE verifier and throws when it is missing', async () => {
    const p = createOAuthProvider('srv-1', {}, redirectUrl, 'st')
    await expect(p.codeVerifier()).rejects.toThrow('code verifier')
    await p.saveCodeVerifier('verifier-abc')
    expect(await p.codeVerifier()).toBe('verifier-abc')
  })
})
