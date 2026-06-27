// Credential-safety primitives shared across the process boundary. The renderer
// validates against them in the Add Server form and JSON import; the main
// process enforces the same rule again at transport construction (defense in
// depth — a config that never went through the UI, e.g. a hand-edited
// config.json, must still not ship a credential header in cleartext).

// Header keys that carry credentials. Matched case-insensitively as a substring
// so variants (X-Api-Key, X-Auth-Token, Set-Cookie, …) are caught without an
// exhaustive list.
const SENSITIVE_HEADER = /authorization|cookie|api[-_]?key|secret|token/i

export function isSensitiveHeaderKey(key: string): boolean {
  return SENSITIVE_HEADER.test(key.trim())
}

// Loopback hosts where plaintext http is acceptable (a local dev MCP server), so
// the credential-over-http guardrail doesn't flag the common localhost case.
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

// Guards against shipping a credential header in cleartext: a sensitive header
// sent over plain http to a non-loopback host. Returns an error message naming
// the offending header, or undefined when there's nothing to flag.
export function credentialOverHttp(url: URL, headerKeys: string[]): string | undefined {
  if (url.protocol !== 'http:' || isLoopbackHost(url.hostname)) return undefined
  const offending = headerKeys.find((k) => isSensitiveHeaderKey(k))
  if (!offending) return undefined
  return `"${offending.trim()}" would be sent in cleartext over http — use https, or remove the header.`
}
