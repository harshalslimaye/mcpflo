import Store from 'electron-store'
import type { ServerConfig } from '../shared/mcp.types'

interface StoreSchema {
  servers: ServerConfig[]
}

export const store = new Store<StoreSchema>({
  name: 'config',
  defaults: {
    servers: [],
  },
})

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
  store.set('servers', servers.filter((s) => s.id !== id))
}
