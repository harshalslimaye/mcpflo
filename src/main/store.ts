import { randomUUID } from 'node:crypto'
import { chmodSync } from 'node:fs'
import Store from 'electron-store'
import type { ServerConfig, LoadedServer, TransportConfig } from '../shared/mcp.types'
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

// The transport fields that carry credentials, by transport type. Note: only
// the OAuth client *secret* is sensitive — clientId and scope are not, so they
// stay in cleartext config.json. Issued tokens live in oauth.json, not here.
interface TransportSecrets {
  env?: unknown
  headers?: unknown
  oauthClientSecret?: string
}

function extractSecrets(config: ServerConfig): TransportSecrets {
  const t = config.transport
  const secrets: TransportSecrets = {}
  if (t.type === 'stdio' && t.env) secrets.env = t.env
  if (t.type === 'streamable-http' && t.headers) secrets.headers = t.headers
  if (t.type === 'streamable-http' && t.oauth?.clientSecret) {
    secrets.oauthClientSecret = t.oauth.clientSecret
  }
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
  // Strip the OAuth client secret out of transport.oauth, keeping the
  // non-secret oauth fields (clientId, scope) in cleartext. Drop oauth entirely
  // if the secret was its only field.
  if (transport.type === 'streamable-http' && transport.oauth?.clientSecret) {
    const oauth = { ...transport.oauth }
    delete oauth.clientSecret
    if (Object.keys(oauth).length > 0) transport.oauth = oauth
    else delete (transport as { oauth?: unknown }).oauth
  }

  return {
    ...config,
    transport,
    secrets: encryptSecret(JSON.stringify(secrets))
  }
}

// Reverses toStored: decrypts the secret blob (if any) and merges the fields
// back into the transport, yielding the full runtime config. A decrypt failure
// is contained per entry — the server is returned with its public config and
// flagged `credentialsUnavailable`, so one unreadable secret (e.g. config copied
// from another machine) can't abort loading of the whole list.
function fromStored(stored: StoredServer): LoadedServer {
  const { secrets, ...config } = stored
  if (!secrets) return config

  let payload: TransportSecrets
  try {
    payload = JSON.parse(decryptSecret(secrets)) as TransportSecrets
  } catch {
    return { ...config, credentialsUnavailable: true }
  }
  const transport = { ...config.transport }
  if (payload.env && transport.type === 'stdio') {
    ;(transport as { env?: unknown }).env = payload.env
  }
  if (payload.headers && transport.type === 'streamable-http') {
    ;(transport as { headers?: unknown }).headers = payload.headers
  }
  if (payload.oauthClientSecret && transport.type === 'streamable-http') {
    transport.oauth = { ...transport.oauth, clientSecret: payload.oauthClientSecret }
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

// Strips the secret transport values (stdio `env`, http `headers`, OAuth
// `clientSecret`) from a decrypted config, keeping the non-secret fields the UI
// needs (url, command, args, OAuth clientId/scope). getServers hands this
// redacted view to the renderer so plaintext secrets never enter the renderer
// process: operations reference a server by id and the main process re-resolves
// the full config via getServerById at the point of use. credentialsUnavailable
// servers carry no decrypted secret to begin with, so this is a no-op for them.
function redactSecrets(server: LoadedServer): LoadedServer {
  const transport = { ...server.transport }
  if (transport.type === 'stdio') {
    if (transport.env !== undefined) delete (transport as { env?: unknown }).env
  } else {
    if (transport.headers !== undefined) delete (transport as { headers?: unknown }).headers
    if (transport.oauth?.clientSecret !== undefined) {
      const oauth = { ...transport.oauth }
      delete oauth.clientSecret
      if (Object.keys(oauth).length > 0) transport.oauth = oauth
      else delete (transport as { oauth?: unknown }).oauth
    }
  }
  return { ...server, transport }
}

// The renderer-facing server list: every config with its secret transport
// values stripped (see redactSecrets). The renderer selects/operates on servers
// by id; it never holds a plaintext credential.
export function getServers(): LoadedServer[] {
  return store.get('servers').map(fromStored).map(redactSecrets)
}

// The full decrypted config for one server, secrets included. Main-process only
// — the IPC operation handlers resolve a server from this at the moment of use,
// so the secret is read in main and never shipped to the renderer. Throws on an
// unknown id (the renderer only ever operates on persisted servers).
export function getServerById(id: string): LoadedServer {
  const stored = store.get('servers').find((s) => s.id === id)
  if (!stored) throw new Error(`Server "${id}" not found`)
  return fromStored(stored)
}

// Returns the redacted view of the newly-added server so the renderer's
// optimistic state update never retains the plaintext secret the user just
// entered — matching what getServers would hand back on the next load.
export function addServer(config: ServerConfig): LoadedServer {
  const servers = store.get('servers')
  if (servers.some((s) => s.id === config.id)) {
    throw new Error(`Server with id "${config.id}" already exists`)
  }
  persist([...servers, toStored(config)])
  return redactSecrets(config)
}

// Re-injects secret transport values the incoming patch omitted but the stored
// config still holds, keyed by matching transport type. The renderer only ever
// sees the redacted config (see redactSecrets), so a transport patch coming back
// from the UI cannot carry a secret it was never given — without this, an edit
// that doesn't re-enter a credential (DCR recovery adding a clientId, a future
// URL change) would silently wipe a header, env var, or client secret the user
// never re-typed. A patch that DOES supply a fresh value for a field overrides,
// as expected. Mutates `next`.
function preserveOmittedSecrets(next: TransportConfig, current: TransportConfig): void {
  if (next.type !== current.type) return
  if (next.type === 'stdio' && current.type === 'stdio') {
    if (next.env === undefined && current.env !== undefined) next.env = current.env
  } else if (next.type === 'streamable-http' && current.type === 'streamable-http') {
    if (next.headers === undefined && current.headers !== undefined) next.headers = current.headers
    const currentSecret = current.oauth?.clientSecret
    if (currentSecret !== undefined && next.oauth?.clientSecret === undefined) {
      next.oauth = { ...next.oauth, clientSecret: currentSecret }
    }
  }
}

// Returns the redacted view of the updated server (see addServer) so the
// renderer's optimistic merge never retains a freshly-entered secret.
export function updateServer(id: string, patch: Partial<Omit<ServerConfig, 'id'>>): LoadedServer {
  const servers = store.get('servers')
  const index = servers.findIndex((s) => s.id === id)
  if (index === -1) throw new Error(`Server "${id}" not found`)
  // Merge against the decrypted config so a patched transport re-encrypts cleanly.
  // Drop the read-time credentialsUnavailable flag so it never round-trips to disk.
  const { credentialsUnavailable, ...current } = fromStored(servers[index])
  const merged = { ...current, ...patch } as ServerConfig
  // A transport patch replaces the transport wholesale, but the redacted renderer
  // can't have sent the secrets back — restore the ones it omitted from the
  // (decrypted) current transport so they survive a non-credential edit.
  if (patch.transport) preserveOmittedSecrets(merged.transport, current.transport)
  const restored = toStored(merged)
  // If the original secret couldn't be decrypted, we can't faithfully re-encrypt
  // it. Preserve the original blob unless this patch actually supplied a fresh
  // credential — which toStored would have re-encrypted into restored.secrets,
  // superseding the unreadable one. Keying off whether new secrets were provided
  // (rather than whether the patch merely touched the transport) means a transport
  // edit that doesn't re-enter the credential — e.g. a URL change — no longer
  // silently destroys the still-unreadable credential.
  if (credentialsUnavailable && servers[index].secrets && !restored.secrets) {
    restored.secrets = servers[index].secrets
  }
  persist(servers.map((s, i) => (i === index ? restored : s)))
  return redactSecrets(merged)
}

export function removeServer(id: string): void {
  const servers = store.get('servers')
  if (!servers.some((s) => s.id === id)) throw new Error(`Server "${id}" not found`)
  persist(servers.filter((s) => s.id !== id))
}
