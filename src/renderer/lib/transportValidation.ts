// Pure validation helpers shared by the manual Add Server form and the pasted
// JSON import, so both reject the same bad streamable-http transports with the
// same rules and messages (rather than letting an invalid URL or a credential
// leaked over plain http slip through to runtime). The credential-safety
// primitives live in shared/transportSafety so the main process can enforce the
// same rule at transport construction; they're re-exported here so existing
// renderer call sites keep importing from one place.
import {
  credentialOverHttp,
  isLoopbackHost,
  isSensitiveHeaderKey
} from '../../shared/transportSafety'

export { credentialOverHttp, isLoopbackHost, isSensitiveHeaderKey }

// Only real HTTP(S) endpoints make sense for a streamable-http transport.
const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

// Validates a streamable-http URL: it must parse and use http/https. Returns the
// parsed URL for callers that need its parts (scheme, host), or an error string.
export function parseTransportUrl(raw: string): { url: URL } | { error: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { error: 'Enter a valid URL, e.g. https://mcp.example.com/mcp' }
  }
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return { error: 'URL must start with http:// or https://' }
  }
  return { url }
}

// First key that repeats, or undefined when all are unique. HTTP header names are
// case-insensitive (so Authorization/authorization collide); env var names are
// not. Blank keys are ignored — they're dropped before the request is built.
export function findDuplicateKey(keys: string[], caseInsensitive: boolean): string | undefined {
  const seen = new Set<string>()
  for (const raw of keys) {
    const k = raw.trim()
    if (!k) continue
    const norm = caseInsensitive ? k.toLowerCase() : k
    if (seen.has(norm)) return k
    seen.add(norm)
  }
  return undefined
}

// Single source for the duplicate-key message so the form's live cue and its
// on-submit validation never drift apart.
export function duplicateKeyMessage(kind: 'header' | 'variable', key: string): string {
  return kind === 'header'
    ? `Duplicate header "${key}" — keys must be unique.`
    : `Duplicate variable "${key}" — names must be unique.`
}
