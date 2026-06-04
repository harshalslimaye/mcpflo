import { create } from 'zustand'
import type { ServerConfig, MCPServer } from '../../shared/mcp.types'

interface ServerStore {
  servers: MCPServer[]
  selectedServerId: string | null

  hydrate: () => Promise<void>
  selectServer: (id: string | null) => void
  addServer: (config: ServerConfig) => Promise<void>
  updateServer: (id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => Promise<void>
  removeServer: (id: string) => Promise<void>
  connectServer: (id: string) => Promise<void>
}

function toRuntime(config: ServerConfig): MCPServer {
  return { ...config, status: 'disconnected', tools: [], resources: [], prompts: [] }
}

export const useServerStore = create<ServerStore>((set, get) => ({
  servers: [],
  selectedServerId: null,

  hydrate: async () => {
    const configs = await window.api.mcp.getServers()
    set({ servers: configs.map(toRuntime) })
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

  connectServer: async (id) => {
    const server = get().servers.find((s) => s.id === id)
    if (!server) return

    // Mark as connecting
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id ? { ...s, status: 'connecting', error: undefined } : s
      )
    }))

    try {
      const { tools, resources, prompts } = await window.api.mcp.connectServer(server)
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, status: 'connected', tools, resources, prompts } : s
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
  }
}))
