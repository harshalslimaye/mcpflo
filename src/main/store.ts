import { randomUUID } from 'node:crypto'
import Store from 'electron-store'
import { REDACTED_SECRET, type ServerConfig, type TransportConfig } from '../shared/mcp.types'
import * as secrets from './secrets'

interface StoreSchema {
  servers: ServerConfig[]
  // True once first-run seeding has happened, so a deleted seed isn't re-added.
  seeded: boolean
  // True when at least one secret had to be stored as plaintext because the OS
  // keyring was unavailable. Surfaced to the UI as a warning.
  secretsPlaintext: boolean
}

export const store = new Store<StoreSchema>({
  name: 'config',
  defaults: {
    servers: [],
    seeded: false,
    secretsPlaintext: false
  }
})

// The secret-bearing field of a transport: env vars for stdio, headers for
// streamable-http. Returns undefined when the transport carries no secrets.
function secretValues(transport: TransportConfig): Record<string, string> | undefined {
  return transport.type === 'stdio' ? transport.env : transport.headers
}

// Returns a copy of `transport` with its secret field rebuilt from `next`.
// Centralises the stdio-env vs http-headers branch so the value-mapping logic
// below stays transport-agnostic.
function withSecrets(transport: TransportConfig, next: Record<string, string>): TransportConfig {
  return transport.type === 'stdio' ? { ...transport, env: next } : { ...transport, headers: next }
}

// Maps a transport's secret values through `fn` (key + value → new value),
// leaving a transport with no secrets untouched.
function mapSecretValues(
  transport: TransportConfig,
  fn: (key: string, value: string) => string
): TransportConfig {
  const values = secretValues(transport)
  if (!values) return transport
  const mapped = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, fn(k, v)]))
  return withSecrets(transport, mapped)
}

// Prepares a transport for persistence: encrypts each secret value, but keeps a
// value the caller didn't change. The renderer only ever sees REDACTED_SECRET
// for an existing secret, so a value still equal to it means "unchanged" — we
// carry over the previously stored (already-encrypted) value for that key
// rather than encrypting the placeholder. New/changed values are plaintext and
// get encrypted; if no keyring is available they're stored plaintext and the
// secretsPlaintext flag is raised.
function prepareTransport(next: TransportConfig, prev?: TransportConfig): TransportConfig {
  const available = secrets.isAvailable()
  // Prior stored secrets are only reusable when the transport kind is unchanged
  // (env and headers don't carry across a type switch).
  const prevValues = prev && prev.type === next.type ? secretValues(prev) : undefined
  let storedPlaintext = false

  const prepared = mapSecretValues(next, (key, value) => {
    if (value === REDACTED_SECRET && prevValues && key in prevValues) {
      return prevValues[key]
    }
    if (available) return secrets.encrypt(value)
    storedPlaintext = true
    return value
  })

  if (storedPlaintext) store.set('secretsPlaintext', true)
  return prepared
}

// Decrypts every secret value in a transport. Tolerates plaintext values
// (legacy or keyring-unavailable), which decrypt() returns unchanged.
function decryptTransport(transport: TransportConfig): TransportConfig {
  return mapSecretValues(transport, (_key, value) => secrets.decrypt(value))
}

// Replaces every secret value with REDACTED_SECRET for the renderer-facing view.
function redactTransport(transport: TransportConfig): TransportConfig {
  return mapSecretValues(transport, () => REDACTED_SECRET)
}

// The MCP reference "everything" server exercises every capability MCPFlo
// supports, so it's a useful ready-to-run example for a brand-new install.
function defaultServers(): ServerConfig[] {
  return [
    {
      id: randomUUID(),
      name: 'Everything',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything']
      }
    }
  ]
}

// Seeds example servers exactly once, on the first launch of a fresh install.
// Runs at startup before the renderer requests the server list.
export function seedDefaultServers(): void {
  if (store.get('seeded')) return
  if (store.get('servers').length === 0) {
    store.set('servers', defaultServers())
  }
  store.set('seeded', true)
}

// Renderer-facing list: secret values are redacted, never decrypted.
export function getServers(): ServerConfig[] {
  return store.get('servers').map((config) => ({
    ...config,
    transport: redactTransport(config.transport)
  }))
}

// Main-process-only: the fully decrypted config used to open a connection.
// Never exposed over IPC — the renderer holds only redacted configs.
export function getServerForConnection(id: string): ServerConfig {
  const config = store.get('servers').find((s) => s.id === id)
  if (!config) throw new Error(`Server "${id}" not found`)
  return { ...config, transport: decryptTransport(config.transport) }
}

// Whether any secret is currently stored as plaintext (keyring unavailable).
export function secretsStoredAsPlaintext(): boolean {
  return store.get('secretsPlaintext')
}

export function addServer(config: ServerConfig): void {
  const servers = store.get('servers')
  if (servers.some((s) => s.id === config.id)) {
    throw new Error(`Server with id "${config.id}" already exists`)
  }
  const stored = { ...config, transport: prepareTransport(config.transport) }
  store.set('servers', [...servers, stored])
}

export function updateServer(id: string, patch: Partial<Omit<ServerConfig, 'id'>>): void {
  const servers = store.get('servers')
  const existing = servers.find((s) => s.id === id)
  if (!existing) throw new Error(`Server "${id}" not found`)
  // Encrypt the patched transport, preserving any secret the caller left as
  // REDACTED_SECRET (i.e. didn't change) against the currently stored value.
  const preparedPatch = patch.transport
    ? { ...patch, transport: prepareTransport(patch.transport, existing.transport) }
    : patch
  const updated = servers.map((s) => (s.id === id ? { ...s, ...preparedPatch } : s))
  store.set('servers', updated)
}

export function removeServer(id: string): void {
  const servers = store.get('servers')
  if (!servers.some((s) => s.id === id)) throw new Error(`Server "${id}" not found`)
  store.set(
    'servers',
    servers.filter((s) => s.id !== id)
  )
}
