import { create } from 'zustand'
import type {
  ServerConfig,
  MCPServer,
  CachedCapabilities,
  ToolCallOutcome,
  ToolCallNotification,
  ElicitationRequestEvent,
  ElicitationResult,
  SamplingRequestEvent,
  SamplingResult
} from '../../shared/mcp.types'

// A single recorded tool invocation, kept in memory for the session.
export interface ToolCallRecord {
  id: string
  serverId: string
  toolName: string
  args: Record<string, unknown>
  status: 'success' | 'error'
  // Full JSON-RPC response envelope, when one was received.
  response?: unknown
  // Transport-level error message, when no response arrived.
  error?: string
  // Notifications (progress, log messages, …) received while the call ran,
  // in arrival order. Empty array when the call produced none.
  notifications: ToolCallNotification[]
  durationMs: number
  at: number
}

// An outcome counts as an error when the connection failed, the server returned
// a JSON-RPC error, or the tool itself reported `isError`.
function outcomeStatus(outcome: ToolCallOutcome): 'success' | 'error' {
  if (outcome.error) return 'error'
  const response = outcome.response
  if (!response || typeof response !== 'object') return 'error'
  const envelope = response as Record<string, unknown>
  if ('error' in envelope) return 'error'
  const result = envelope.result as { isError?: boolean } | undefined
  return result?.isError === true ? 'error' : 'success'
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
  // Notifications streamed by the currently running call for a tool, keyed by
  // `toolKey`. An entry exists only while that call is in flight.
  liveNotifications: Record<string, ToolCallNotification[]>
  // Elicitation requests awaiting a user answer, in arrival order. The modal
  // shows the head of the queue; later requests wait their turn.
  pendingElicitations: ElicitationRequestEvent[]
  // Sampling requests awaiting a user answer, in arrival order. Same queueing
  // behaviour as elicitations.
  pendingSamplings: SamplingRequestEvent[]

  hydrate: () => Promise<void>
  selectServer: (id: string | null) => void
  selectTool: (serverId: string, toolName: string) => void
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<void>
  enqueueElicitation: (event: ElicitationRequestEvent) => void
  removeElicitation: (elicitationId: string) => void
  respondToElicitation: (elicitationId: string, result: ElicitationResult) => Promise<void>
  enqueueSampling: (event: SamplingRequestEvent) => void
  removeSampling: (samplingId: string) => void
  respondToSampling: (samplingId: string, result: SamplingResult) => Promise<void>
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
  liveNotifications: {},
  pendingElicitations: [],
  pendingSamplings: [],

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

    const key = toolKey(serverId, toolName)
    // Ties pushed notifications back to this specific invocation, so frames
    // from concurrent calls on other tools never bleed into this one.
    const callId = crypto.randomUUID()
    const notifications: ToolCallNotification[] = []
    const unsubscribe = window.api.mcp.onToolNotification((event) => {
      if (event.callId !== callId) return
      notifications.push(event.notification)
      set((state) => ({
        liveNotifications: { ...state.liveNotifications, [key]: [...notifications] }
      }))
    })

    const at = Date.now()
    let record: ToolCallRecord
    try {
      const taskSupport = server.tools.find((t) => t.name === toolName)?.execution?.taskSupport
      const outcome = await window.api.mcp.callTool(server, toolName, args, callId, taskSupport)
      record = {
        id: crypto.randomUUID(),
        serverId,
        toolName,
        args,
        status: outcomeStatus(outcome),
        response: outcome.response,
        error: outcome.error,
        notifications,
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
        notifications,
        durationMs: Date.now() - at,
        at
      }
    } finally {
      unsubscribe()
    }

    set((state) => {
      const live = { ...state.liveNotifications }
      delete live[key]
      return {
        history: { ...state.history, [key]: [record, ...(state.history[key] ?? [])] },
        liveNotifications: live
      }
    })
  },

  enqueueElicitation: (event) =>
    set((state) => ({ pendingElicitations: [...state.pendingElicitations, event] })),

  removeElicitation: (elicitationId) =>
    set((state) => ({
      pendingElicitations: state.pendingElicitations.filter(
        (e) => e.elicitationId !== elicitationId
      )
    })),

  respondToElicitation: async (elicitationId, result) => {
    await window.api.mcp.respondToElicitation(elicitationId, result)
    get().removeElicitation(elicitationId)
  },

  enqueueSampling: (event) =>
    set((state) => ({ pendingSamplings: [...state.pendingSamplings, event] })),

  removeSampling: (samplingId) =>
    set((state) => ({
      pendingSamplings: state.pendingSamplings.filter((s) => s.samplingId !== samplingId)
    })),

  respondToSampling: async (samplingId, result) => {
    await window.api.mcp.respondToSampling(samplingId, result)
    get().removeSampling(samplingId)
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
