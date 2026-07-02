import http from 'http'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type { OAuthConfig } from '../shared/mcp.types'
import { readOAuthState, saveTokens, saveClientInformation, saveCodeVerifier } from './oauthStore'
import { openExternalSafely } from './openExternal'

// How long the loopback listener waits for the browser redirect before giving
// up. Exported so tests can drive it with fake timers.
export const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

export interface LoopbackListener {
  // The bound ephemeral (or persisted) port — known as soon as listen succeeds,
  // before the browser is ever opened, so it can go into redirect_uris.
  port: number
  // Settles when the browser hits /callback: resolves with the auth code on a
  // valid redirect, rejects on an error param, state mismatch, or timeout.
  result: Promise<{ code: string }>
  // Tears the server down without waiting on `result` — used on the token-valid
  // path where no browser round-trip happens.
  close: () => void
}

function page(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>MCPFlo</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding-top:4rem;color:#333">
<h2>MCPFlo</h2><p>${message}</p></body></html>`
}

// Starts a loopback HTTP server on 127.0.0.1 to capture the OAuth redirect
// (RFC 8252). The outer promise resolves once the port is bound; `result`
// settles later when /callback is hit. `expectedState` is compared against the
// returned `state` param for CSRF protection — the SDK only sends a state param
// because the provider implements `state()`.
export function startLoopbackListener(expectedState: string, port = 0): Promise<LoopbackListener> {
  return new Promise<LoopbackListener>((resolveOuter, rejectOuter) => {
    let resolveResult!: (value: { code: string }) => void
    let rejectResult!: (reason: Error) => void
    const result = new Promise<{ code: string }>((res, rej) => {
      resolveResult = res
      rejectResult = rej
    })

    let timeout: ReturnType<typeof setTimeout> | undefined
    const close = (): void => {
      if (timeout) clearTimeout(timeout)
      server.close()
    }

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end()
        return
      }

      const reply = (status: number, message: string): void => {
        res.writeHead(status, { 'Content-Type': 'text/html' })
        res.end(page(message))
      }

      // The state check must come first and, on mismatch, must not settle (or
      // tear down) the flow. Anything on the machine can hit this port — a
      // port scanner, a browser prefetch, or a no-cors fetch() fired by an
      // unrelated page the user has open — and a mismatched request proves
      // nothing about whether it's the real redirect. Reply 400 to just that
      // request and keep listening for the one that actually carries the
      // state this attempt generated, up to the timeout. (RFC 6749 4.1.2.1
      // requires the state to be echoed back on an error redirect too, so a
      // compliant server's genuine "access denied" redirect isn't affected.)
      const state = url.searchParams.get('state')
      if (state !== expectedState) {
        reply(400, 'Invalid authorization state. You can close this tab.')
        return
      }

      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')

      if (error) {
        reply(400, 'Authorization failed. You can close this tab.')
        rejectResult(new Error(`Authorization error: ${error}`))
      } else if (!code) {
        reply(400, 'Missing authorization code. You can close this tab.')
        rejectResult(new Error('Missing authorization code'))
      } else {
        reply(200, 'You can close this tab and return to MCPFlo.')
        resolveResult({ code })
      }
      close()
    })

    let triedFallback = false
    const onListen = (): void => {
      const address = server.address()
      const boundPort = address && typeof address === 'object' ? address.port : 0
      timeout = setTimeout(() => {
        rejectResult(new Error('Authorization timed out'))
        close()
      }, CALLBACK_TIMEOUT_MS)
      resolveOuter({ port: boundPort, result, close })
    }

    server.on('error', (err: NodeJS.ErrnoException) => {
      // A persisted port may be taken (another instance, or reassigned by the
      // OS). Fall back to an ephemeral port once; the caller persists the new
      // one and the server re-registers its redirect_uri.
      if (err.code === 'EADDRINUSE' && port !== 0 && !triedFallback) {
        triedFallback = true
        server.listen(0, '127.0.0.1', onListen)
        return
      }
      rejectOuter(err)
    })

    server.listen(port, '127.0.0.1', onListen)
  })
}

// Builds the OAuthClientProvider the SDK drives through the auth flow. All token
// and client-info persistence is delegated to oauthStore; `redirectUrl` and
// `oauthState` are fixed for the lifetime of one transaction (the caller binds
// the loopback port and generates the state before constructing this).
export function createOAuthProvider(
  serverId: string,
  config: OAuthConfig,
  redirectUrl: string,
  oauthState: string
): OAuthClientProvider {
  return {
    get redirectUrl(): string {
      return redirectUrl
    },

    get clientMetadata(): OAuthClientMetadata {
      return {
        client_name: 'MCPFlo',
        redirect_uris: [redirectUrl],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: config.clientSecret ? 'client_secret_basic' : 'none',
        // Omit scope entirely when unset rather than serializing `undefined`.
        ...(config.scope !== undefined && { scope: config.scope })
      }
    },

    // The SDK sends this as the OAuth `state` param; the loopback listener
    // validates the redirect against the same value.
    state(): string {
      return oauthState
    },

    // Manual credentials (if configured) take precedence; otherwise fall back to
    // a previously persisted DCR result. Returning undefined lets the SDK run DCR.
    async clientInformation(): Promise<OAuthClientInformation | undefined> {
      if (config.clientId) {
        return {
          client_id: config.clientId,
          ...(config.clientSecret !== undefined && { client_secret: config.clientSecret })
        }
      }
      return (await readOAuthState(serverId))?.client_information
    },

    async saveClientInformation(info: OAuthClientInformation): Promise<void> {
      await saveClientInformation(serverId, info)
    },

    async tokens(): Promise<OAuthTokens | undefined> {
      return (await readOAuthState(serverId))?.tokens
    },

    async saveTokens(tokens: OAuthTokens): Promise<void> {
      await saveTokens(serverId, tokens)
    },

    async codeVerifier(): Promise<string> {
      const verifier = (await readOAuthState(serverId))?.code_verifier
      if (!verifier) throw new Error('No PKCE code verifier saved for this authorization')
      return verifier
    },

    async saveCodeVerifier(verifier: string): Promise<void> {
      await saveCodeVerifier(serverId, verifier)
    },

    redirectToAuthorization(authorizationUrl: URL): void {
      openExternalSafely(authorizationUrl.toString())
    }
  }
}

// Once a provider's loopback listener has served its one redirect (or was
// closed after a token-valid connect), its `redirectUrl` points nowhere —
// nothing is listening on that port anymore. But the SDK doesn't know that:
// a later request on the same session (e.g. a mid-session refresh-token
// failure) would still call `redirectToAuthorization` on this same provider,
// silently popping the user's browser open to an address that can never
// complete. authorizeAndConnect calls this the moment the loopback is known
// dead, so that path instead surfaces as `UnauthorizedError` → auth_required,
// and only the user's explicit "Sign in" click (which binds a fresh loopback)
// ever opens a browser tab from then on.
export function disableAutoRedirect(provider: OAuthClientProvider): void {
  provider.redirectToAuthorization = (): void => {}
}
