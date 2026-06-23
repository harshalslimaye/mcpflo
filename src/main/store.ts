import { randomUUID } from 'node:crypto'
import { chmodSync } from 'node:fs'
import Store from 'electron-store'
import type { ServerConfig } from '../shared/mcp.types'
import { encryptSecret, decryptSecret } from './secrets'

// What we actually persist for a server: the public config with its secret
// fields stripped out of the transport, plus an encrypted blob holding those
// secrets. So config.json on disk never contains a cleartext token or header.
type StoredServer = ServerConfig & { secrets?: string }

interface StoreSchema {
  servers: StoredServer[]
  // True once first-run seeding has happened, so a deleted seed isn't re-added.
  seeded: boolean
}

export const store = new Store<StoreSchema>({
  name: 'config',
  defaults: {
    servers: [],
    seeded: false
  }
})

// config.json holds (encrypted) credentials, so it shouldn't be world-readable.
// chmod is a no-op concept on Windows and the mocked store has no path, so this
// is best-effort.
function tightenPermissions(): void {
  try {
    if (store.path) chmodSync(store.path, 0o600)
  } catch {
    // A failed chmod (unsupported FS, Windows) must not break persistence.
  }
}

function persist(servers: StoredServer[]): void {
  store.set('servers', servers)
  tightenPermissions()
}

// The transport fields that carry credentials, by transport type.
function extractSecrets(config: ServerConfig): { env?: unknown; headers?: unknown } {
  const t = config.transport
  const secrets: { env?: unknown; headers?: unknown } = {}
  if (t.type === 'stdio' && t.env) secrets.env = t.env
  if (t.type === 'streamable-http' && t.headers) secrets.headers = t.headers
  return secrets
}

// Splits a config into its public part (persisted in cleartext) and an encrypted
// blob for the secret-bearing transport fields. Configs with no secrets are
// stored as-is, with no blob.
function toStored(config: ServerConfig): StoredServer {
  const secrets = extractSecrets(config)
  if (Object.keys(secrets).length === 0) return { ...config }

  const transport = { ...config.transport }
  delete (transport as { env?: unknown }).env
  delete (transport as { headers?: unknown }).headers

  return {
    ...config,
    transport,
    secrets: encryptSecret(JSON.stringify(secrets))
  }
}

// Reverses toStored: decrypts the secret blob (if any) and merges the fields
// back into the transport, yielding the full runtime config.
function fromStored(stored: StoredServer): ServerConfig {
  const { secrets, ...config } = stored
  if (!secrets) return config

  const payload = JSON.parse(decryptSecret(secrets)) as { env?: unknown; headers?: unknown }
  const transport = { ...config.transport }
  if (payload.env && transport.type === 'stdio') {
    ;(transport as { env?: unknown }).env = payload.env
  }
  if (payload.headers && transport.type === 'streamable-http') {
    ;(transport as { headers?: unknown }).headers = payload.headers
  }
  return { ...config, transport }
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
    persist(defaultServers().map(toStored))
  }
  store.set('seeded', true)
}

export function getServers(): ServerConfig[] {
  return store.get('servers').map(fromStored)
}

export function addServer(config: ServerConfig): void {
  const servers = store.get('servers')
  if (servers.some((s) => s.id === config.id)) {
    throw new Error(`Server with id "${config.id}" already exists`)
  }
  persist([...servers, toStored(config)])
}

export function updateServer(id: string, patch: Partial<Omit<ServerConfig, 'id'>>): void {
  const servers = store.get('servers')
  const index = servers.findIndex((s) => s.id === id)
  if (index === -1) throw new Error(`Server "${id}" not found`)
  // Merge against the decrypted config so a patched transport re-encrypts cleanly.
  const merged = { ...fromStored(servers[index]), ...patch } as ServerConfig
  persist(servers.map((s, i) => (i === index ? toStored(merged) : s)))
}

export function removeServer(id: string): void {
  const servers = store.get('servers')
  if (!servers.some((s) => s.id === id)) throw new Error(`Server "${id}" not found`)
  persist(servers.filter((s) => s.id !== id))
}
