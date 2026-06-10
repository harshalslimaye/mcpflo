import { create } from 'zustand'
import type {
  ServerConfig,
  MCPServer,
  CachedCapabilities,
  ToolCallResult
} from '../../shared/mcp.types'

// A single recorded tool invocation, kept in memory for the session.
export interface ToolCallRecord {
  id: string
  serverId: string
  toolName: string
  args: Record<string, unknown>
  status: 'success' | 'error'
  result?: ToolCallResult
  error?: string
  durationMs: number
  at: number
}

// History is keyed per tool; names are only unique within a server.
export function toolKey(serverId: string, toolName: string): string {
  return `${serverId}::${toolName}`
}

// Identifies a selected tool. Tool names are only unique within a server, so
// the owning server id is part of the key.
export interface SelectedTool {
  serverId: string
  toolName: string
}

interface ServerStore {
  servers: MCPServer[]
  selectedServerId: string | null
  selectedTool: SelectedTool | null
  // Per-tool call history (newest first), keyed by `toolKey(serverId, toolName)`.
  history: Record<string, ToolCallRecord[]>

  hydrate: () => Promise<void>
  selectServer: (id: string | null) => void
  selectTool: (serverId: string, toolName: string) => void
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<void>
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
  selectedTool: null,
  history: {},

  hydrate: async () => {
    const [configs, cache] = await Promise.all([
      window.api.mcp.getServers(),
      window.api.mcp.getCachedCapabilities()
    ])
    set({ servers: configs.map((c) => toRuntime(c, cache[c.id])) })
  },

  selectServer: (id) => set({ selectedServerId: id }),

  selectTool: (serverId, toolName) => set({ selectedTool: { serverId, toolName } }),

  executeTool: async (serverId, toolName, args) => {
    const server = get().servers.find((s) => s.id === serverId)
    if (!server) return

    const at = Date.now()
    let record: ToolCallRecord
    try {
      const result = await window.api.mcp.callTool(server, toolName, args)
      record = {
        id: crypto.randomUUID(),
        serverId,
        toolName,
        args,
        status: result.isError ? 'error' : 'success',
        result,
        durationMs: Date.now() - at,
        at
      }
    } catch (err) {
      record = {
        id: crypto.randomUUID(),
        serverId,
        toolName,
        args,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - at,
        at
      }
    }

    const key = toolKey(serverId, toolName)
    set((state) => ({
      history: { ...state.history, [key]: [record, ...(state.history[key] ?? [])] }
    }))
  },

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
      selectedServerId: state.selectedServerId === id ? null : state.selectedServerId,
      selectedTool: state.selectedTool?.serverId === id ? null : state.selectedTool,
      history: Object.fromEntries(
        Object.entries(state.history).filter(([key]) => !key.startsWith(`${id}::`))
      )
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
