import type { ServerConfig } from '../../shared/mcp.types'
import { parseTransportUrl, credentialOverHttp } from './transportValidation'

// Parses pasted JSON into one or more ServerConfigs, for the "Paste JSON
// config" import in AddServerModal. Two shapes are accepted, both lifted
// from the Claude Desktop / Cursor mcp.json convention:
//
//   { "mcpServers": { "name": { "command": "npx", "args": [...] } } }   (one or many)
//   { "name": "my-server", "url": "https://...", "headers": {...} }    (single, bare)
//
// Validation is all-or-nothing: every entry must be structurally valid and
// its name must not collide with an existing server before any config is
// returned, so the caller never has to roll back a partial import.

export interface ParseSuccess {
  ok: true
  configs: ServerConfig[]
}

export interface ParseFailure {
  ok: false
  error: string
}

export type ParseResult = ParseSuccess | ParseFailure

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return isPlainObject(v) && Object.values(v).every((x) => typeof x === 'string')
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

/** Validates and converts one entry's body into a transport, or returns an error string. */
function toTransport(name: string, body: Record<string, unknown>): TransportResult {
  if (typeof body.command === 'string') {
    if (!body.command.trim()) return { error: `"${name}": command must not be empty` }
    if (body.args !== undefined && !isStringArray(body.args)) {
      return { error: `"${name}": args must be an array of strings` }
    }
    if (body.env !== undefined && !isStringRecord(body.env)) {
      return { error: `"${name}": env must be an object of string values` }
    }
    return {
      transport: {
        type: 'stdio',
        command: body.command.trim(),
        ...(body.args ? { args: body.args as string[] } : {}),
        ...(body.env ? { env: body.env as Record<string, string> } : {})
      }
    }
  }

  if (typeof body.url === 'string') {
    if (!body.url.trim()) return { error: `"${name}": url must not be empty` }
    const parsed = parseTransportUrl(body.url.trim())
    if ('error' in parsed) return { error: `"${name}": ${parsed.error}` }
    if (body.headers !== undefined && !isStringRecord(body.headers)) {
      return { error: `"${name}": headers must be an object of string values` }
    }
    const headers = body.headers as Record<string, string> | undefined
    if (headers) {
      const cleartext = credentialOverHttp(parsed.url, Object.keys(headers))
      if (cleartext) return { error: `"${name}": ${cleartext}` }
    }
    return {
      transport: {
        type: 'streamable-http',
        url: body.url.trim(),
        ...(headers ? { headers } : {})
      }
    }
  }

  return { error: `"${name}" must have either "command" or "url"` }
}

type TransportResult =
  | { transport: ServerConfig['transport']; error?: undefined }
  | { error: string }

function toConfig(
  name: string,
  body: Record<string, unknown>,
  existingNames: ReadonlySet<string>
): { config: ServerConfig } | { error: string } {
  const trimmedName = name.trim()
  if (!trimmedName) return { error: 'Server name must not be empty' }
  if (existingNames.has(trimmedName)) {
    return { error: `A server named "${trimmedName}" already exists` }
  }

  const result = toTransport(trimmedName, body)
  // Narrow on the success member: the error member has no `transport`, and the
  // success member's `error?: undefined` keeps `'error' in result` from narrowing.
  if (!('transport' in result)) return { error: result.error }

  return { config: { id: crypto.randomUUID(), name: trimmedName, transport: result.transport } }
}

export function parseServerConfigJson(
  raw: string,
  existingNames: ReadonlySet<string>
): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'Expected a JSON object' }
  }

  // Multi-entry: { "mcpServers": { name: { ... } } }
  if ('mcpServers' in parsed) {
    if (!isPlainObject(parsed.mcpServers)) {
      return { ok: false, error: '"mcpServers" must be an object' }
    }
    const entries = Object.entries(parsed.mcpServers)
    if (entries.length === 0) {
      return { ok: false, error: 'No servers found in "mcpServers"' }
    }

    const configs: ServerConfig[] = []
    const seenNames = new Set(existingNames)
    for (const [name, body] of entries) {
      if (!isPlainObject(body)) {
        return { ok: false, error: `"${name}" must be an object` }
      }
      const result = toConfig(name, body, seenNames)
      if ('error' in result) return { ok: false, error: result.error }
      configs.push(result.config)
      seenNames.add(result.config.name)
    }
    return { ok: true, configs }
  }

  // Single, bare entry: { "name": "...", "command"/"url": ... }
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    return { ok: false, error: 'Provide a "name", or wrap the entry in "mcpServers"' }
  }
  const result = toConfig(parsed.name, parsed, existingNames)
  if ('error' in result) return { ok: false, error: result.error }
  return { ok: true, configs: [result.config] }
}
