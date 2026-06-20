import { randomUUID } from 'node:crypto'
import Store from 'electron-store'
import type { ServerConfig } from '../shared/mcp.types'

interface StoreSchema {
  servers: ServerConfig[]
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

export function getServers(): ServerConfig[] {
  return store.get('servers')
}

export function addServer(config: ServerConfig): void {
  const servers = store.get('servers')
  if (servers.some((s) => s.id === config.id)) {
    throw new Error(`Server with id "${config.id}" already exists`)
  }
  store.set('servers', [...servers, config])
}

export function updateServer(id: string, patch: Partial<Omit<ServerConfig, 'id'>>): void {
  const servers = store.get('servers')
  const index = servers.findIndex((s) => s.id === id)
  if (index === -1) throw new Error(`Server "${id}" not found`)
  const updated = servers.map((s) => (s.id === id ? { ...s, ...patch } : s))
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
