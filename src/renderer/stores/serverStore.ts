import { create } from 'zustand'
import type { ServerConfig, MCPServer, CachedCapabilities } from '../../shared/mcp.types'

interface ServerStore {
  servers: MCPServer[]
  selectedServerId: string | null

  hydrate: () => Promise<void>
  selectServer: (id: string | null) => void
  addServer: (config: ServerConfig) => Promise<void>
  updateServer: (id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => Promise<void>
  removeServer: (id: string) => Promise<void>
  fetchCapabilities: (id: string) => Promise<void>
  refreshCapabilities: (id: string) => Promise<void>
}

function toRuntime(config: ServerConfig, cached?: CachedCapabilities): MCPServer {
  return {
    ...config,
    // A cached server starts green (capabilities available); an unfetched one grey.
    status: cached ? 'connected' : 'disconnected',
    tools: cached?.tools ?? [],
    resources: cached?.resources ?? [],
    prompts: cached?.prompts ?? [],
    fetchedAt: cached?.fetchedAt
  }
}

export const useServerStore = create<ServerStore>((set, get) => ({
  servers: [],
  selectedServerId: null,

  hydrate: async () => {
    const [configs, cache] = await Promise.all([
      window.api.mcp.getServers(),
      window.api.mcp.getCachedCapabilities()
    ])
    set({ servers: configs.map((c) => toRuntime(c, cache[c.id])) })
  },

  selectServer: (id) => set({ selectedServerId: id }),

  addServer: async (config) => {
    await window.api.mcp.addServer(config)
    set((state) => ({ servers: [...state.servers, toRuntime(config)] }))
  },

  updateServer: async (id, patch) => {
    await window.api.mcp.updateServer(id, patch)
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...patch } : s))
    }))
  },

  removeServer: async (id) => {
    await window.api.mcp.removeServer(id)
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
      selectedServerId: state.selectedServerId === id ? null : state.selectedServerId
    }))
  },

  fetchCapabilities: async (id) => {
    const server = get().servers.find((s) => s.id === id)
    if (!server) return

    // grey/green → yellow
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id ? { ...s, status: 'connecting', error: undefined } : s
      )
    }))

    try {
      const { tools, resources, prompts } = await window.api.mcp.fetchCapabilities(server)
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id
            ? { ...s, status: 'connected', tools, resources, prompts, fetchedAt: Date.now() }
            : s
        )
      }))
    } catch (err) {
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id
            ? { ...s, status: 'error', error: err instanceof Error ? err.message : String(err) }
            : s
        )
      }))
    }
  },

  // Clears the cache and fetches again — the manual "refresh" action.
  refreshCapabilities: async (id) => {
    await window.api.mcp.clearCapabilities(id)
    await get().fetchCapabilities(id)
  }
}))
