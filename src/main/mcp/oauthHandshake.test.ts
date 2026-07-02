import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { ServerConfig, AuthEvent } from '../../shared/mcp.types'

interface MockTransport {
  url?: URL
  opts: Record<string, unknown> | undefined
  finishAuth: (code: string) => unknown
}

const h = vi.hoisted(() => ({
  transports: [] as MockTransport[],
  startLoopbackListener: vi.fn(),
  createOAuthProvider: vi.fn(() => ({})),
  disableAutoRedirect: vi.fn(),
  readOAuthState: vi.fn(),
  saveRedirectPort: vi.fn(),
  clearClientInformation: vi.fn(),
  isSecretStorageAvailable: vi.fn(() => true),
  // A controllable loopback handle: tests set `result` and inspect `close`.
  loopback: { port: 0, result: Promise.resolve({ code: 'CODE' }), close: vi.fn() },
  // Set by a test to make the next-created transport's finishAuth (the token
  // exchange) reject, instead of racing to grab the instance after the fact.
  finishAuthError: null as Error | null
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    url: URL
    opts: Record<string, unknown> | undefined
    finishAuth = vi.fn(() =>
      h.finishAuthError ? Promise.reject(h.finishAuthError) : Promise.resolve(undefined)
    )
    constructor(url: URL, opts?: Record<string, unknown>) {
      this.url = url
      this.opts = opts
      h.transports.push(this)
    }
  }
}))

// Minimal UnauthorizedError so authorizeAndConnect's `instanceof` check has a
// class to match. Re-imported post-reset in beforeEach so identities line up.
vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message?: string) {
      super(message)
      this.name = 'UnauthorizedError'
    }
  }
}))

vi.mock('../secrets', () => ({
  isSecretStorageAvailable: h.isSecretStorageAvailable
}))

vi.mock('../oauthStore', () => ({
  readOAuthState: h.readOAuthState,
  saveRedirectPort: h.saveRedirectPort,
  clearClientInformation: h.clearClientInformation,
  EncryptionUnavailableError: class EncryptionUnavailableError extends Error {
    code = 'ENCRYPTION_UNAVAILABLE'
    constructor() {
      super('OAuth tokens require OS-level encryption, which is not available on this system.')
    }
  }
}))

vi.mock('../oauthProvider', () => ({
  startLoopbackListener: h.startLoopbackListener,
  createOAuthProvider: h.createOAuthProvider,
  disableAutoRedirect: h.disableAutoRedirect
}))

const oauthConfig: ServerConfig = {
  id: 'srv-oauth',
  name: 'OAuth Server',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp', auth: 'oauth', oauth: {} }
}

function lastTransport(): MockTransport {
  return h.transports[h.transports.length - 1]
}

describe('oauthHandshake', () => {
  let mod: typeof import('./oauthHandshake')
  let authMod: typeof import('@modelcontextprotocol/sdk/client/auth.js')
  let fakeClient: { connect: ReturnType<typeof vi.fn> }

  // Runs buildOAuthTransport + authorizeAndConnect back to back, the way
  // session.ts's createSession does, against a bare fake Client.
  function connect(config: ServerConfig = oauthConfig, signal?: AbortSignal): Promise<unknown> {
    return mod
      .buildOAuthTransport(config)
      .then(({ makeTransport, loopback, provider }) =>
        mod.authorizeAndConnect(
          config,
          fakeClient as unknown as Client,
          makeTransport,
          loopback,
          provider,
          signal
        )
      )
  }

  function unauthorized(): Error {
    return new authMod.UnauthorizedError('401')
  }

  function captureAuthEvents(): AuthEvent[] {
    const events: AuthEvent[] = []
    mod.onAuthEvent((e) => events.push(e))
    return events
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    h.transports.length = 0
    fakeClient = { connect: vi.fn().mockResolvedValue(undefined) }
    h.isSecretStorageAvailable.mockReturnValue(true)
    h.readOAuthState.mockResolvedValue(null)
    h.saveRedirectPort.mockResolvedValue(undefined)
    h.clearClientInformation.mockResolvedValue(undefined)
    h.createOAuthProvider.mockReturnValue({})
    h.loopback.port = 51234
    h.loopback.result = Promise.resolve({ code: 'CODE' })
    h.loopback.close = vi.fn()
    h.startLoopbackListener.mockResolvedValue(h.loopback)
    h.finishAuthError = null
    // Fresh authEmitter and UnauthorizedError identity per test.
    vi.resetModules()
    mod = await import('./oauthHandshake')
    authMod = await import('@modelcontextprotocol/sdk/client/auth.js')
  })

  describe('buildOAuthTransport', () => {
    it('attaches an auth provider and forwards static headers', async () => {
      const headered: ServerConfig = {
        ...oauthConfig,
        transport: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          auth: 'oauth',
          oauth: {},
          headers: { 'X-Trace': '1' }
        }
      }
      await connect(headered)
      const opts = lastTransport().opts as Record<string, unknown>
      expect(opts.authProvider).toBeDefined()
      expect(opts.requestInit).toEqual({ headers: { 'X-Trace': '1' } })
      expect(h.createOAuthProvider).toHaveBeenCalledWith(
        'srv-oauth',
        {},
        'http://127.0.0.1:51234/callback',
        expect.any(String)
      )
    })

    it('blocks the flow when OS encryption is unavailable', async () => {
      h.isSecretStorageAvailable.mockReturnValue(false)
      await expect(mod.buildOAuthTransport(oauthConfig)).rejects.toThrow(/encryption/i)
      expect(h.startLoopbackListener).not.toHaveBeenCalled()
    })

    it('refuses plain http to a non-loopback host even with no static headers configured', async () => {
      // The bearer token is attached by the SDK itself at request time — it
      // never shows up in `t.headers` — so this must be caught independent of
      // whatever static headers are (or aren't) set.
      const insecure: ServerConfig = {
        ...oauthConfig,
        transport: { type: 'streamable-http', url: 'http://mcp.example.com/mcp', auth: 'oauth' }
      }
      await expect(mod.buildOAuthTransport(insecure)).rejects.toThrow('cleartext over http')
      expect(h.startLoopbackListener).not.toHaveBeenCalled()
    })

    it('allows plain http to a loopback host', async () => {
      const local: ServerConfig = {
        ...oauthConfig,
        transport: { type: 'streamable-http', url: 'http://127.0.0.1:9000/mcp', auth: 'oauth' }
      }
      await expect(mod.buildOAuthTransport(local)).resolves.toBeDefined()
    })

    describe('redirect port persistence', () => {
      it('persists a freshly bound ephemeral port', async () => {
        await connect()
        expect(h.startLoopbackListener).toHaveBeenCalledWith(expect.any(String), undefined)
        expect(h.saveRedirectPort).toHaveBeenCalledWith('srv-oauth', 51234)
      })

      it('reuses the persisted port without rewriting it', async () => {
        h.readOAuthState.mockResolvedValue({ redirect_port: 51234 })
        await connect()
        expect(h.startLoopbackListener).toHaveBeenCalledWith(expect.any(String), 51234)
        expect(h.saveRedirectPort).not.toHaveBeenCalled()
        expect(h.clearClientInformation).not.toHaveBeenCalled()
      })

      it('drops a DCR registration when the persisted port was taken (fallback)', async () => {
        // Persisted port 40000, but the listener fell back to 51234 — the prior
        // registration's redirect_uri now points at the wrong port, so it must be
        // cleared to force re-registration against the new redirect_uri.
        h.readOAuthState.mockResolvedValue({
          redirect_port: 40000,
          client_information: { client_id: 'registered' }
        })
        await connect()
        expect(h.saveRedirectPort).toHaveBeenCalledWith('srv-oauth', 51234)
        expect(h.clearClientInformation).toHaveBeenCalledWith('srv-oauth')
      })

      it('keeps a manual clientId registration intact on a port fallback', async () => {
        // A configured clientId isn't a DCR registration, so there's nothing to
        // invalidate even when the port changes.
        const withClientId: ServerConfig = {
          ...oauthConfig,
          transport: {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            auth: 'oauth',
            oauth: { clientId: 'cid' }
          }
        }
        h.readOAuthState.mockResolvedValue({
          redirect_port: 40000,
          client_information: { client_id: 'cid' }
        })
        await connect(withClientId)
        expect(h.saveRedirectPort).toHaveBeenCalledWith('srv-oauth', 51234)
        expect(h.clearClientInformation).not.toHaveBeenCalled()
      })
    })
  })

  describe('authorizeAndConnect', () => {
    it('connects with valid tokens without opening the browser', async () => {
      const events = captureAuthEvents()
      await connect()
      expect(fakeClient.connect).toHaveBeenCalledTimes(1)
      expect(h.loopback.close).toHaveBeenCalledTimes(1)
      expect(lastTransport().finishAuth).not.toHaveBeenCalled()
      expect(events).toEqual([{ type: 'success', serverId: 'srv-oauth' }])
      // The loopback is dead the moment it's closed, even on this no-browser
      // path — a later mid-session refresh failure must not try to redirect
      // through it (see disableAutoRedirect).
      expect(h.disableAutoRedirect).toHaveBeenCalledTimes(1)
    })

    it('runs the 401 → browser → finishAuth → retry flow', async () => {
      fakeClient.connect.mockRejectedValueOnce(unauthorized()).mockResolvedValue(undefined)
      const events = captureAuthEvents()

      await connect()

      expect(lastTransport().finishAuth).toHaveBeenCalledWith('CODE')
      expect(fakeClient.connect).toHaveBeenCalledTimes(2)
      expect(events).toEqual([
        { type: 'pending', serverId: 'srv-oauth' },
        { type: 'success', serverId: 'srv-oauth' }
      ])
      // The loopback served (and self-closed after) the one callback it was
      // going to get — nothing on this session should be able to trigger
      // another redirect through it.
      expect(h.disableAutoRedirect).toHaveBeenCalledTimes(1)
    })

    it('retries on a fresh transport instead of reusing the one the failed connect killed', async () => {
      // The real SDK closes the transport when the post-connect initialize
      // request comes back 401, and a closed StreamableHTTPClientTransport can
      // never be start()ed again (its AbortController is set for life) — so
      // retrying on the same instance throws "already started" instead of
      // reconnecting. Assert the retry goes through a brand new transport.
      fakeClient.connect.mockRejectedValueOnce(unauthorized()).mockResolvedValue(undefined)

      await connect()

      expect(h.transports).toHaveLength(2)
      const [firstAttempt, retryAttempt] = h.transports
      expect(retryAttempt).not.toBe(firstAttempt)
      expect(fakeClient.connect).toHaveBeenNthCalledWith(1, firstAttempt, { timeout: undefined })
      expect(fakeClient.connect).toHaveBeenNthCalledWith(2, retryAttempt, { timeout: undefined })
      expect(firstAttempt.finishAuth).not.toHaveBeenCalled()
      expect(retryAttempt.finishAuth).toHaveBeenCalledWith('CODE')
    })

    it('reports an error when the retry is still unauthorized', async () => {
      fakeClient.connect.mockRejectedValue(unauthorized())
      const events = captureAuthEvents()

      await expect(connect()).rejects.toThrow()
      expect(events).toEqual([
        { type: 'pending', serverId: 'srv-oauth' },
        { type: 'error', serverId: 'srv-oauth', reason: 'Auth failed after code exchange' }
      ])
      // The callback itself was received fine — only the post-finishAuth
      // connect failed — so the (now-dead) loopback must still be disarmed.
      expect(h.disableAutoRedirect).toHaveBeenCalledTimes(1)
    })

    it('reports an error and skips connect when finishAuth (the token exchange) rejects', async () => {
      // A failure exchanging the code for tokens — e.g. invalid_grant, or the
      // token endpoint erroring — must not propagate uncaught: previously
      // nothing reported it, so the row stayed stuck on the 'pending' state
      // emitted above with no 'error' or 'auth_required' event to move it off.
      fakeClient.connect.mockRejectedValueOnce(unauthorized())
      h.finishAuthError = new Error('invalid_grant')
      const events = captureAuthEvents()

      await expect(connect()).rejects.toThrow('invalid_grant')
      expect(events).toEqual([
        { type: 'pending', serverId: 'srv-oauth' },
        { type: 'error', serverId: 'srv-oauth', reason: 'invalid_grant' }
      ])
      // The failed exchange means there's nothing to connect with — the
      // second client.connect() call must never happen.
      expect(fakeClient.connect).toHaveBeenCalledTimes(1)
    })

    it('aborts the loopback wait when the signal fires (cancel)', async () => {
      fakeClient.connect.mockRejectedValueOnce(unauthorized()).mockResolvedValue(undefined)
      // A callback that never lands, so only the abort can settle the wait.
      const pending = new Promise<{ code: string }>(() => {})
      h.loopback.result = pending
      const controller = new AbortController()
      const events = captureAuthEvents()

      const flow = connect(oauthConfig, controller.signal)
      controller.abort(new Error('Capability fetch cancelled'))

      await expect(flow).rejects.toThrow('cancelled')
      expect(lastTransport().finishAuth).not.toHaveBeenCalled()
      expect(h.loopback.close).toHaveBeenCalled()
      expect(events).toEqual([
        { type: 'pending', serverId: 'srv-oauth' },
        { type: 'error', serverId: 'srv-oauth', reason: 'Capability fetch cancelled' }
      ])
      // No callback was ever received, so there's nothing to disarm — the
      // provider is discarded along with this failed attempt.
      expect(h.disableAutoRedirect).not.toHaveBeenCalled()
    })

    it('reports an error and skips finishAuth when the callback never resolves', async () => {
      fakeClient.connect.mockRejectedValueOnce(unauthorized()).mockResolvedValue(undefined)
      const rejected = Promise.reject(new Error('Authorization timed out'))
      rejected.catch(() => {})
      h.loopback.result = rejected
      const events = captureAuthEvents()

      await expect(connect()).rejects.toThrow('timed out')
      expect(lastTransport().finishAuth).not.toHaveBeenCalled()
      expect(events).toEqual([
        { type: 'pending', serverId: 'srv-oauth' },
        { type: 'error', serverId: 'srv-oauth', reason: 'Authorization timed out' }
      ])
      expect(h.disableAutoRedirect).not.toHaveBeenCalled()
    })
  })

  describe('DCR failure heuristic', () => {
    it('reports dcr_required when registration was the only path to credentials', async () => {
      fakeClient.connect.mockRejectedValue(new Error('Incompatible auth server'))
      const events = captureAuthEvents()

      await expect(connect()).rejects.toThrow('Dynamic client registration is not supported')
      expect(h.loopback.close).toHaveBeenCalled()
      expect(events).toEqual([{ type: 'dcr_required', serverId: 'srv-oauth' }])
    })

    it('treats a network error on first connect as retryable, not a DCR failure', async () => {
      // Offline / host unreachable: a connectivity error, not a 401 → never
      // reached registration. It must surface its raw message and open no modal.
      fakeClient.connect.mockRejectedValue(new Error('fetch failed'))
      const events = captureAuthEvents()

      await expect(connect()).rejects.toThrow('fetch failed')
      expect(events).toEqual([{ type: 'error', serverId: 'srv-oauth', reason: 'fetch failed' }])
    })

    it('treats a network errno (cause chain) as retryable, not a DCR failure', async () => {
      const wrapped = new Error('connect error')
      ;(wrapped as { cause?: unknown }).cause = Object.assign(new Error('getaddrinfo'), {
        code: 'ENOTFOUND'
      })
      fakeClient.connect.mockRejectedValue(wrapped)
      const events = captureAuthEvents()

      await expect(connect()).rejects.toThrow('connect error')
      expect(events).toEqual([{ type: 'error', serverId: 'srv-oauth', reason: 'connect error' }])
    })

    it('surfaces the raw error when a clientId is configured', async () => {
      const withClientId: ServerConfig = {
        ...oauthConfig,
        transport: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          auth: 'oauth',
          oauth: { clientId: 'cid' }
        }
      }
      fakeClient.connect.mockRejectedValue(new Error('network down'))
      const events = captureAuthEvents()

      await expect(connect(withClientId)).rejects.toThrow('network down')
      expect(events).toEqual([{ type: 'error', serverId: 'srv-oauth', reason: 'network down' }])
    })
  })

  it('onAuthEvent unsubscribe stops delivery', async () => {
    const events: AuthEvent[] = []
    const unsub = mod.onAuthEvent((e) => events.push(e))
    unsub()
    await connect()
    expect(events).toHaveLength(0)
  })
})
