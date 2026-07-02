import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { OAuthTokens, OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { AuthDetails } from '../shared/mcp.types'
import { encryptSecret, decryptSecret, isSecretStorageAvailable } from './secrets'

// Per-server OAuth state lives in <userData>/servers/<id>/oauth.json, alongside
// capabilities.json (see capabilitiesCache.ts). Issued tokens, the registered
// client information (DCR result), the in-flight PKCE verifier, and the loopback
// redirect port are all kept here — never in config.json.
//
// Secret fields (access_token, refresh_token, client_secret, code_verifier) are
// encrypted at rest via Electron safeStorage (the same mechanism as secrets.ts).
// Non-secret fields (token type, scope, client_id, redirect_port) stay cleartext
// so the file is inspectable. Writes are temp-file + rename so a crash mid-write
// can't leave a half-written file behind.

// The decrypted shape callers work with.
export interface OAuthState {
  tokens?: OAuthTokens
  // When `tokens` was last written (Date.now(), ms) — the anchor `tokens.expires_in`
  // (a relative lifetime in seconds) is measured from. Without this there's no way
  // to tell whether a saved token has actually expired, only that one was once
  // issued. Non-secret; re-stamped on every saveTokens call (initial exchange and
  // refresh alike).
  tokens_issued_at?: number
  client_information?: OAuthClientInformation
  code_verifier?: string
  // Loopback redirect port, persisted so the DCR-registered redirect_uri stays
  // stable across app restarts. Non-secret.
  redirect_port?: number
}

// Structured error so the renderer can distinguish "OS encryption unavailable"
// from other failures and show the dedicated message.
export class EncryptionUnavailableError extends Error {
  readonly code = 'ENCRYPTION_UNAVAILABLE'
  constructor() {
    super(
      'OAuth tokens require OS-level encryption, which is not available on this system. ' +
        'Use a static token instead.'
    )
    this.name = 'EncryptionUnavailableError'
  }
}

function ensureEncryption(): void {
  if (!isSecretStorageAvailable()) throw new EncryptionUnavailableError()
}

function serverDir(id: string): string {
  return join(app.getPath('userData'), 'servers', id)
}

function oauthFile(id: string): string {
  return join(serverDir(id), 'oauth.json')
}

// On-disk shape: identical to OAuthState except the secret string fields hold
// ciphertext rather than plaintext.
interface StoredOAuthState {
  tokens?: Record<string, unknown>
  tokens_issued_at?: number
  client_information?: Record<string, unknown>
  code_verifier?: string
  redirect_port?: number
}

function encode(state: OAuthState): StoredOAuthState {
  const out: StoredOAuthState = {}
  if (state.tokens) {
    out.tokens = {
      ...state.tokens,
      access_token: encryptSecret(state.tokens.access_token),
      ...(state.tokens.refresh_token !== undefined && {
        refresh_token: encryptSecret(state.tokens.refresh_token)
      })
    }
  }
  if (state.client_information) {
    out.client_information = {
      ...state.client_information,
      ...(state.client_information.client_secret !== undefined && {
        client_secret: encryptSecret(state.client_information.client_secret)
      })
    }
  }
  if (state.tokens_issued_at !== undefined) out.tokens_issued_at = state.tokens_issued_at
  if (state.code_verifier !== undefined) out.code_verifier = encryptSecret(state.code_verifier)
  if (state.redirect_port !== undefined) out.redirect_port = state.redirect_port
  return out
}

function decode(stored: StoredOAuthState): OAuthState {
  const out: OAuthState = {}
  if (stored.tokens) {
    out.tokens = {
      ...stored.tokens,
      access_token: decryptSecret(stored.tokens.access_token as string),
      ...(stored.tokens.refresh_token !== undefined && {
        refresh_token: decryptSecret(stored.tokens.refresh_token as string)
      })
    } as OAuthTokens
  }
  if (stored.client_information) {
    out.client_information = {
      ...stored.client_information,
      ...(stored.client_information.client_secret !== undefined && {
        client_secret: decryptSecret(stored.client_information.client_secret as string)
      })
    } as OAuthClientInformation
  }
  if (stored.tokens_issued_at !== undefined) out.tokens_issued_at = stored.tokens_issued_at
  if (stored.code_verifier !== undefined) out.code_verifier = decryptSecret(stored.code_verifier)
  if (stored.redirect_port !== undefined) out.redirect_port = stored.redirect_port
  return out
}

async function writeOAuthState(id: string, state: OAuthState): Promise<void> {
  ensureEncryption()
  await fs.mkdir(serverDir(id), { recursive: true })
  const file = oauthFile(id)
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(encode(state), null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

// Returns the decrypted OAuth state, or null if the server has none on disk.
export async function readOAuthState(id: string): Promise<OAuthState | null> {
  let raw: string
  try {
    raw = await fs.readFile(oauthFile(id), 'utf-8')
  } catch {
    return null
  }
  // ensureEncryption throws EncryptionUnavailableError — a meaningful, actionable
  // condition the renderer surfaces, so it stays outside the catch below.
  ensureEncryption()
  try {
    return decode(JSON.parse(raw) as StoredOAuthState)
  } catch {
    // A malformed or partially-written oauth.json — bad JSON, a missing encrypted
    // field, or ciphertext that can't be opened on this machine — is treated as
    // "no saved state" so the provider's tokens()/clientInformation() fall back to
    // a fresh sign-in rather than throwing a raw parse/crypto error out of connect.
    return null
  }
}

// Whether a server currently holds issued OAuth tokens that haven't expired —
// the truth behind "signed in". Used at hydrate to restore the renderer's auth
// status (which otherwise resets to idle on restart) without ever shipping the
// token itself across the IPC boundary; only this boolean crosses.
//
// `expires_in` (seconds) is only a *relative* lifetime — without tokens_issued_at
// as an anchor there'd be no way to tell an hour-old token from a ten-second-old
// one, so presence alone would have to stand in for validity. A server that
// omits expires_in (or a state saved before this field existed) is treated as
// non-expiring: there's nothing to check it against, and the operation-path
// 401 handling still catches a truly dead token on first real use either way.
export async function hasValidOAuthTokens(id: string): Promise<boolean> {
  const state = await readOAuthState(id)
  const tokens = state?.tokens
  if (tokens?.access_token === undefined) return false
  if (tokens.expires_in === undefined || state?.tokens_issued_at === undefined) return true
  return state.tokens_issued_at + tokens.expires_in * 1000 > Date.now()
}

// Builds the redacted session summary the auth details panel renders — every
// field is derived metadata; the token strings themselves never leave this
// module. `manualClientId`/`manualHasClientSecret` are the config-level
// identity (when the user set one), which is the identity actually in use —
// it takes precedence over a DCR result exactly the way the provider's
// clientInformation() does. Null when no tokens are held (the panel only
// shows for a signed-in server).
export async function readAuthDetails(
  id: string,
  manualClientId?: string,
  manualHasClientSecret = false
): Promise<AuthDetails | null> {
  const state = await readOAuthState(id)
  const tokens = state?.tokens
  if (tokens?.access_token === undefined) return null
  const issuedAt = state?.tokens_issued_at
  const clientId = manualClientId ?? state?.client_information?.client_id
  const hasClientSecret =
    manualHasClientSecret || state?.client_information?.client_secret !== undefined
  return {
    ...(clientId !== undefined && { clientId }),
    registration: manualClientId ? 'manual' : 'dcr',
    clientType: hasClientSecret ? 'confidential' : 'public',
    ...(tokens.scope !== undefined && { scope: tokens.scope }),
    tokenType: tokens.token_type,
    ...(issuedAt !== undefined && { issuedAt }),
    expiresAt:
      tokens.expires_in !== undefined && issuedAt !== undefined
        ? issuedAt + tokens.expires_in * 1000
        : null,
    hasRefreshToken: tokens.refresh_token !== undefined,
    hasIdToken: tokens.id_token !== undefined,
    ...(state?.redirect_port !== undefined && {
      redirectUri: `http://127.0.0.1:${state.redirect_port}/callback`
    })
  }
}

// Each saver is a read-modify-write of the whole file. OAuth flows are
// serialized per server (one transaction at a time), so there's no concurrent
// read-modify-write race to guard against here.
export async function saveTokens(id: string, tokens: OAuthTokens): Promise<void> {
  const state = (await readOAuthState(id)) ?? {}
  // Re-stamped on every call — a refresh gets a fresh expiry window exactly
  // like an initial exchange does, since both go through this same saver.
  await writeOAuthState(id, { ...state, tokens, tokens_issued_at: Date.now() })
}

export async function saveClientInformation(
  id: string,
  info: OAuthClientInformation
): Promise<void> {
  const state = (await readOAuthState(id)) ?? {}
  await writeOAuthState(id, { ...state, client_information: info })
}

export async function saveCodeVerifier(id: string, verifier: string): Promise<void> {
  const state = (await readOAuthState(id)) ?? {}
  await writeOAuthState(id, { ...state, code_verifier: verifier })
}

export async function saveRedirectPort(id: string, port: number): Promise<void> {
  const state = (await readOAuthState(id)) ?? {}
  await writeOAuthState(id, { ...state, redirect_port: port })
}

// Sign-out: drops issued tokens and the in-flight verifier, but preserves
// client_information (the DCR result) and redirect_port so re-auth doesn't force
// re-registration or a new redirect_uri.
export async function clearOAuthTokens(id: string): Promise<void> {
  const state = await readOAuthState(id)
  if (!state) return
  await writeOAuthState(id, {
    client_information: state.client_information,
    redirect_port: state.redirect_port
  })
}

// Drops the DCR registration (client_information) while preserving tokens, the
// in-flight verifier and the redirect_port. Used when the loopback port — and
// thus the redirect_uri — changes under us, invalidating the registered
// redirect_uri so the SDK must re-register.
export async function clearClientInformation(id: string): Promise<void> {
  const state = await readOAuthState(id)
  if (!state?.client_information) return
  const next = { ...state }
  delete next.client_information
  await writeOAuthState(id, next)
}

// Full wipe — used on explicit reset. (Server removal deletes the entire folder
// via removeServerDir, so this is only needed for in-place resets.)
export async function clearOAuthState(id: string): Promise<void> {
  await fs.rm(oauthFile(id), { force: true })
}
