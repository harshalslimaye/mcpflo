import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { ServerConfig, AuthEvent } from '../../shared/mcp.types'
import { isSecretStorageAvailable } from '../secrets'
import {
  readOAuthState,
  saveRedirectPort,
  clearClientInformation,
  EncryptionUnavailableError
} from '../oauthStore'
import { createOAuthProvider, startLoopbackListener, type LoopbackListener } from '../oauthProvider'
import { assertCredentialSafe } from './transportFactory'

// Thrown by the OAuth handshake when the server doesn't support Dynamic Client
// Registration and no manual Client ID is configured — registration is then the
// only route to credentials, so there's nothing to retry without one. Distinct
// from the SDK's UnauthorizedError so fetchCapabilities can translate it into a
// benign authRequired outcome (the dcr_required auth event, emitted alongside,
// drives the recovery modal).
export class DcrRegistrationRequiredError extends Error {
  constructor() {
    super('Dynamic client registration is not supported by this server')
    this.name = 'DcrRegistrationRequiredError'
  }
}

// OAuth flow progress is broadcast over a module-level emitter rather than the
// per-call `active` slot used by elicitation/sampling: auth events aren't tied
// to any tool call. ipc.ts subscribes via `onAuthEvent` and forwards to the
// renderer (with a sender-lifecycle guard) over the `mcp:authEvent` channel.
const authEmitter = new EventEmitter()

// Exported so a session torn down mid-operation (handleOperationAuthError, in
// ./session) can flip the renderer into auth_required without round-tripping
// through a fresh connect attempt.
export function emitAuth(event: AuthEvent): void {
  authEmitter.emit('event', event)
}

export function onAuthEvent(listener: (event: AuthEvent) => void): () => void {
  authEmitter.on('event', listener)
  return () => authEmitter.off('event', listener)
}

// Builds the OAuth-mode streamable-http transport factory. Binds the loopback
// listener up front (the bound port goes into the redirect_uri), reusing the
// persisted port so the DCR-registered redirect_uri stays stable across
// restarts; a fresh ephemeral port (stale persisted port taken) is written
// back. `makeTransport` rather than a single transport instance: the SDK's
// Client.connect closes the transport when the post-connect initialize
// request fails (e.g. the 401 that drives the OAuth retry below), and a
// closed StreamableHTTPClientTransport can never be start()ed again — so the
// retry after finishAuth needs a fresh instance bound to the same provider.
// The returned `loopback` is awaited only if connect throws UnauthorizedError.
export async function buildOAuthTransport(config: ServerConfig): Promise<{
  makeTransport: () => StreamableHTTPClientTransport
  loopback: LoopbackListener
}> {
  const t = config.transport
  if (t.type !== 'streamable-http') {
    throw new Error('OAuth is only supported on streamable-http transports')
  }
  // No silent in-memory fallback: OAuth tokens must be encryptable at rest.
  if (!isSecretStorageAvailable()) throw new EncryptionUnavailableError()

  const url = new URL(t.url)
  // Static headers still ride alongside OAuth (Authorization is blocked in the UI,
  // so it can't collide with the bearer token the provider injects) — but they're
  // subject to the same cleartext-credential guardrail as a plain http transport.
  assertCredentialSafe(url, t.headers)

  const saved = await readOAuthState(config.id)
  const oauthState = randomUUID()
  const loopback = await startLoopbackListener(oauthState, saved?.redirect_port)
  if (loopback.port !== saved?.redirect_port) {
    await saveRedirectPort(config.id, loopback.port)
    // The persisted port was taken and the listener fell back to a fresh one, so
    // the redirect_uri just changed. A prior DCR registration still carries the
    // old port's redirect_uri and the auth server would reject the mismatch —
    // drop that registration so the SDK re-registers against the new redirect_uri.
    // Manual clientId configs have no DCR registration to invalidate.
    if (saved?.client_information && !t.oauth?.clientId) {
      await clearClientInformation(config.id)
    }
  }

  const redirectUrl = `http://127.0.0.1:${loopback.port}/callback`
  const provider = createOAuthProvider(config.id, t.oauth ?? {}, redirectUrl, oauthState)
  const makeTransport = (): StreamableHTTPClientTransport =>
    new StreamableHTTPClientTransport(url, {
      authProvider: provider,
      requestInit: { headers: t.headers ?? {} }
    })
  return { makeTransport, loopback }
}

// Drives the 401 → browser → finishAuth → retry handshake around connect. On the
// token-valid path no browser opens: connect succeeds and the listener is torn
// down without ever being awaited. Returns the transport instance that ended up
// connected, so the caller can stash the live one (not the first, possibly
// dead, attempt) on the session.
export async function authorizeAndConnect(
  config: ServerConfig,
  client: Client,
  makeTransport: () => StreamableHTTPClientTransport,
  loopback: LoopbackListener,
  signal?: AbortSignal
): Promise<StreamableHTTPClientTransport> {
  const serverId = config.id
  const timeout = config.overrides?.timeoutMs
  const transport = makeTransport()
  try {
    await client.connect(transport, { timeout, signal })
    loopback.close()
    emitAuth({ type: 'success', serverId })
    return transport
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      loopback.close()
      // DCR failures throw a typed error so fetchCapabilities can present them as
      // an authRequired outcome rather than a hard connect error; everything else
      // propagates raw.
      if (await emitConnectFailure(config, err)) throw new DcrRegistrationRequiredError()
      throw err
    }
  }

  // 401: the SDK already opened the browser via redirectToAuthorization during
  // the failed connect, and (since the failure surfaced past the post-connect
  // initialize request) already closed `transport` for good. Wait for the
  // loopback redirect, exchange the code, then retry on a fresh transport.
  emitAuth({ type: 'pending', serverId })
  let code: string
  try {
    // Race the (possibly long) human consent wait against an explicit cancel:
    // loopback.close() alone leaves its result pending, so abort must reject the
    // wait itself. The capability-fetch cancel button is the caller of `signal`.
    ;({ code } = await waitForCallback(loopback, signal))
  } catch (err) {
    loopback.close()
    emitAuth({ type: 'error', serverId, reason: err instanceof Error ? err.message : String(err) })
    throw err
  }
  const retryTransport = makeTransport()
  await retryTransport.finishAuth(code)
  try {
    await client.connect(retryTransport, { timeout, signal })
  } catch (err) {
    emitAuth({ type: 'error', serverId, reason: 'Auth failed after code exchange' })
    throw err
  }
  emitAuth({ type: 'success', serverId })
  return retryTransport
}

// Awaits the loopback redirect, but rejects early if the caller aborts (the
// cancel button). The listener's own close() doesn't settle its result promise,
// so without this an abort would leave the wait hanging until CALLBACK_TIMEOUT_MS.
// On abort we close the listener and reject with the signal's reason.
function waitForCallback(
  loopback: LoopbackListener,
  signal?: AbortSignal
): Promise<{ code: string }> {
  if (!signal) return loopback.result
  if (signal.aborted) {
    loopback.close()
    return Promise.reject(signalReason(signal))
  }
  return new Promise<{ code: string }>((resolve, reject) => {
    const onAbort = (): void => {
      loopback.close()
      reject(signalReason(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    loopback.result.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      }
    )
  })
}

// AbortSignal.reason is `any`; normalize to an Error for the auth event/log.
function signalReason(signal: AbortSignal): Error {
  const reason = signal.reason
  if (reason instanceof Error) return reason
  return new Error(typeof reason === 'string' ? reason : 'Authorization cancelled')
}

// Connectivity errno codes (offline, DNS, refused, TLS handshake) raised by
// fetch/undici. A connect failure carrying one of these never reached the point
// of attempting registration, so it must not be misread as a DCR failure.
const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
])

// True when a connect failure is a transport/connectivity problem rather than a
// server-side auth outcome. Walks the error's `cause` chain (fetch wraps the
// real socket error) checking both the errno code and the message, so a
// retryable network error is never mistaken for "registration unsupported".
function isNetworkError(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code
    if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true
    if (
      /fetch failed|network|getaddrinfo|socket hang up|timed out|tls|certificate/i.test(e.message)
    )
      return true
  }
  return false
}

// Classifies a non-UnauthorizedError connect failure and emits the matching auth
// event. DCR is the only route to credentials when there's no configured clientId
// and nothing registered yet — so a failure under those preconditions is treated
// as "registration unsupported" (emit dcr_required, return true so the caller
// throws the typed DCR error and the recovery modal opens) *unless* it's a
// recognizable network error, which is retryable and surfaces its raw message.
async function emitConnectFailure(config: ServerConfig, err: unknown): Promise<boolean> {
  const t = config.transport
  const reason = err instanceof Error ? err.message : String(err)
  const hasClientId = t.type === 'streamable-http' && !!t.oauth?.clientId
  if (!hasClientId && !isNetworkError(err)) {
    const saved = await readOAuthState(config.id)
    if (!saved?.client_information) {
      emitAuth({ type: 'dcr_required', serverId: config.id })
      return true
    }
  }
  emitAuth({ type: 'error', serverId: config.id, reason })
  return false
}
