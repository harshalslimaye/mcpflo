import { create } from 'zustand'
import {
  REDACTED_SECRET,
  type ServerConfig,
  type TransportConfig,
  type MCPServer,
  type CachedCapabilities,
  type ToolCallOutcome,
  type ResourceReadOutcome,
  type PromptGetOutcome,
  type ToolCallNotification,
  type ElicitationRequestEvent,
  type ElicitationResult,
  type SamplingRequestEvent,
  type SamplingResult
} from '../../shared/mcp.types'
import { capResponse, pushCapped } from '../lib/historyRecord'
import { useErrorStore, toMessage } from './errorStore'

// Routes an MCPFlo operational failure to the toast surface. Used by actions
// that talk to the main process, where a rejection has no other home (unlike
// tool/resource/prompt calls, whose errors land in a history record).
function reportError(err: unknown): void {
  useErrorStore.getState().pushError(toMessage(err))
}

// A single recorded tool invocation, kept in memory for the session.
export interface ToolCallRecord {
  id: string
  serverId: string
  toolName: string
  args: Record<string, unknown>
  status: 'success' | 'error'
  // Full JSON-RPC response envelope, when one was received.
  response?: unknown
  // True when the response was dropped because it exceeded the in-memory size
  // budget (see capResponse). Distinguishes a deliberately-dropped payload from
  // a transport failure, which also leaves `response` undefined.
  responseTruncated?: boolean
  // Transport-level error message, when no response arrived.
  error?: string
  // Notifications (progress, log messages, …) received while the call ran,
  // in arrival order. Empty array when the call produced none.
  notifications: ToolCallNotification[]
  durationMs: number
  at: number
}

// A single recorded resource read, kept in memory for the session. Mirrors
// `ToolCallRecord` minus the tool-only fields (args, notifications): a read has
// no inputs and no mid-call side channels.
export interface ResourceReadRecord {
  id: string
  serverId: string
  uri: string
  status: 'success' | 'error'
  // Full JSON-RPC response envelope, when one was received.
  response?: unknown
  // See ToolCallRecord.responseTruncated.
  responseTruncated?: boolean
  // Transport-level error message, when no response arrived.
  error?: string
  durationMs: number
  at: number
}

// A single recorded prompt get, kept in memory for the session. Like a resource
// read it has no notifications/side channels, but like a tool call it carries
// the `args` it was invoked with (prompts take named string inputs), so History
// entries are clickable to re-fill the form.
export interface PromptGetRecord {
  id: string
  serverId: string
  promptName: string
  args: Record<string, string>
  status: 'success' | 'error'
  // Full JSON-RPC response envelope, when one was received.
  response?: unknown
  // See ToolCallRecord.responseTruncated.
  responseTruncated?: boolean
  // Transport-level error message, when no response arrived.
  error?: string
  durationMs: number
  at: number
}

// An outcome counts as an error when the connection failed, the server returned
// a JSON-RPC error, or the tool itself reported `isError`. Resource reads and
// prompt gets share the same { response, error } shape, so this classifies all
// three (a read/get result has no `isError`, so it lands on the success path).
function outcomeStatus(
  outcome: ToolCallOutcome | ResourceReadOutcome | PromptGetOutcome
): 'success' | 'error' {
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

// Read history is keyed per resource; uris are only unique within a server.
export function resourceKey(serverId: string, uri: string): string {
  return `${serverId}::${uri}`
}

// Get history is keyed per prompt; names are only unique within a server.
export function promptKey(serverId: string, promptName: string): string {
  return `${serverId}::${promptName}`
}

// Identifies a selected tool. Tool names are only unique within a server, so
// the owning server id is part of the key.
export interface SelectedTool {
  serverId: string
  toolName: string
}

// Identifies a selected resource. Uris are only unique within a server, so the
// owning server id is part of the key.
export interface SelectedResource {
  serverId: string
  uri: string
}

// Identifies a selected prompt. Prompt names are only unique within a server, so
// the owning server id is part of the key.
export interface SelectedPrompt {
  serverId: string
  promptName: string
}

interface ServerStore {
  servers: MCPServer[]
  selectedServerId: string | null
  selectedTool: SelectedTool | null
  selectedResource: SelectedResource | null
  selectedPrompt: SelectedPrompt | null
  // Per-tool call history (newest first), keyed by `toolKey(serverId, toolName)`.
  history: Record<string, ToolCallRecord[]>
  // Per-resource read history (newest first), keyed by `resourceKey(serverId, uri)`.
  resourceHistory: Record<string, ResourceReadRecord[]>
  // Per-prompt get history (newest first), keyed by `promptKey(serverId, promptName)`.
  promptHistory: Record<string, PromptGetRecord[]>
  // Notifications streamed by the currently running call for a tool, keyed by
  // `toolKey`. An entry exists only while that call is in flight.
  liveNotifications: Record<string, ToolCallNotification[]>
  // Elicitation requests awaiting a user answer, in arrival order. The modal
  // shows the head of the queue; later requests wait their turn.
  pendingElicitations: ElicitationRequestEvent[]
  // Sampling requests awaiting a user answer, in arrival order. Same queueing
  // behaviour as elicitations.
  pendingSamplings: SamplingRequestEvent[]
  // True when the main process had to store at least one secret as plaintext
  // (no OS keyring). Drives the security warning banner.
  secretsPlaintext: boolean

  hydrate: () => Promise<void>
  selectServer: (id: string | null) => void
  selectTool: (serverId: string, toolName: string) => void
  selectResource: (serverId: string, uri: string) => void
  selectPrompt: (serverId: string, promptName: string) => void
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<void>
  clearHistory: (serverId: string, toolName: string) => void
  readResource: (serverId: string, uri: string) => Promise<void>
  clearResourceHistory: (serverId: string, uri: string) => void
  getPrompt: (serverId: string, promptName: string, args: Record<string, string>) => Promise<void>
  clearPromptHistory: (serverId: string, promptName: string) => void
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

// Masks secret values (stdio env vars / http headers) so a config the user
// just entered isn't kept verbatim in the long-lived store. The main process
// redacts configs it hands back via getServers the same way; this keeps the
// add/update paths — where the value arrives plaintext from the form — aligned
// with that. Connections go by id, so the renderer never needs the real values.
function redactSecrets(transport: TransportConfig): TransportConfig {
  if (transport.type === 'stdio') {
    if (!transport.env) return transport
    return { ...transport, env: maskValues(transport.env) }
  }
  if (!transport.headers) return transport
  return { ...transport, headers: maskValues(transport.headers) }
}

function maskValues(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(values).map((k) => [k, REDACTED_SECRET]))
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
  selectedResource: null,
  selectedPrompt: null,
  history: {},
  resourceHistory: {},
  promptHistory: {},
  liveNotifications: {},
  pendingElicitations: [],
  pendingSamplings: [],
  secretsPlaintext: false,

  hydrate: async () => {
    try {
      const [configs, cache, secretsStatus] = await Promise.all([
        window.api.mcp.getServers(),
        window.api.mcp.getCachedCapabilities(),
        window.api.mcp.getSecretsStatus()
      ])
      set({
        servers: configs.map((c) => toRuntime(c, cache[c.id])),
        secretsPlaintext: secretsStatus.plaintext
      })
    } catch (err) {
      // A startup read failure would otherwise leave the app blank with no
      // explanation; surface it instead.
      reportError(err)
    }
  },

  selectServer: (id) => set({ selectedServerId: id }),

  // Tool, resource and prompt selection are mutually exclusive — the content
  // area shows exactly one detail view — so selecting one clears the others.
  selectTool: (serverId, toolName) =>
    set({ selectedTool: { serverId, toolName }, selectedResource: null, selectedPrompt: null }),

  selectResource: (serverId, uri) =>
    set({ selectedResource: { serverId, uri }, selectedTool: null, selectedPrompt: null }),

  selectPrompt: (serverId, promptName) =>
    set({ selectedPrompt: { serverId, promptName }, selectedTool: null, selectedResource: null }),

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
      const outcome = await window.api.mcp.callTool(serverId, toolName, args, callId, taskSupport)
      const { response, truncated } = capResponse(outcome.response)
      record = {
        id: crypto.randomUUID(),
        serverId,
        toolName,
        args,
        status: outcomeStatus(outcome),
        response,
        responseTruncated: truncated,
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
        history: { ...state.history, [key]: pushCapped(state.history[key], record) },
        liveNotifications: live
      }
    })
  },

  clearHistory: (serverId, toolName) => {
    const key = toolKey(serverId, toolName)
    set((state) => {
      const next = { ...state.history }
      delete next[key]
      return { history: next }
    })
  },

  readResource: async (serverId, uri) => {
    const server = get().servers.find((s) => s.id === serverId)
    if (!server) return

    const key = resourceKey(serverId, uri)
    const at = Date.now()
    let record: ResourceReadRecord
    try {
      const outcome = await window.api.mcp.readResource(serverId, uri)
      const { response, truncated } = capResponse(outcome.response)
      record = {
        id: crypto.randomUUID(),
        serverId,
        uri,
        status: outcomeStatus(outcome),
        response,
        responseTruncated: truncated,
        error: outcome.error,
        durationMs: Date.now() - at,
        at
      }
    } catch (err) {
      record = {
        id: crypto.randomUUID(),
        serverId,
        uri,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - at,
        at
      }
    }

    set((state) => ({
      resourceHistory: {
        ...state.resourceHistory,
        [key]: pushCapped(state.resourceHistory[key], record)
      }
    }))
  },

  clearResourceHistory: (serverId, uri) => {
    const key = resourceKey(serverId, uri)
    set((state) => {
      const next = { ...state.resourceHistory }
      delete next[key]
      return { resourceHistory: next }
    })
  },

  getPrompt: async (serverId, promptName, args) => {
    const server = get().servers.find((s) => s.id === serverId)
    if (!server) return

    const key = promptKey(serverId, promptName)
    const at = Date.now()
    let record: PromptGetRecord
    try {
      const outcome = await window.api.mcp.getPrompt(serverId, promptName, args)
      const { response, truncated } = capResponse(outcome.response)
      record = {
        id: crypto.randomUUID(),
        serverId,
        promptName,
        args,
        status: outcomeStatus(outcome),
        response,
        responseTruncated: truncated,
        error: outcome.error,
        durationMs: Date.now() - at,
        at
      }
    } catch (err) {
      record = {
        id: crypto.randomUUID(),
        serverId,
        promptName,
        args,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - at,
        at
      }
    }

    set((state) => ({
      promptHistory: {
        ...state.promptHistory,
        [key]: pushCapped(state.promptHistory[key], record)
      }
    }))
  },

  clearPromptHistory: (serverId, promptName) => {
    const key = promptKey(serverId, promptName)
    set((state) => {
      const next = { ...state.promptHistory }
      delete next[key]
      return { promptHistory: next }
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
    try {
      await window.api.mcp.respondToElicitation(elicitationId, result)
    } catch (err) {
      reportError(err)
    } finally {
      // Always dismiss the request locally: if the reply failed to reach the
      // main process the modal can't usefully retry, so don't leave it wedged.
      get().removeElicitation(elicitationId)
    }
  },

  enqueueSampling: (event) =>
    set((state) => ({ pendingSamplings: [...state.pendingSamplings, event] })),

  removeSampling: (samplingId) =>
    set((state) => ({
      pendingSamplings: state.pendingSamplings.filter((s) => s.samplingId !== samplingId)
    })),

  respondToSampling: async (samplingId, result) => {
    try {
      await window.api.mcp.respondToSampling(samplingId, result)
    } catch (err) {
      reportError(err)
    } finally {
      // Always dismiss the request locally: if the reply failed to reach the
      // main process the modal can't usefully retry, so don't leave it wedged.
      get().removeSampling(samplingId)
    }
  },

  addServer: async (config) => {
    try {
      await window.api.mcp.addServer(config)
    } catch (err) {
      // Toast for the user, then re-throw so the modal stays open instead of
      // silently dismissing as if the add succeeded.
      reportError(err)
      throw err
    }
    // Store the redacted form: the plaintext secret was only needed to reach
    // the main process, which has now persisted it encrypted.
    const redacted = { ...config, transport: redactSecrets(config.transport) }
    set((state) => ({ servers: [...state.servers, toRuntime(redacted)] }))
  },

  updateServer: async (id, patch) => {
    try {
      await window.api.mcp.updateServer(id, patch)
    } catch (err) {
      reportError(err)
      throw err
    }
    // Redact any secret in the patch before it lands in the store, mirroring
    // what getServers would return on the next hydrate.
    const safePatch = patch.transport
      ? { ...patch, transport: redactSecrets(patch.transport) }
      : patch
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...safePatch } : s))
    }))
  },

  removeServer: async (id) => {
    try {
      await window.api.mcp.removeServer(id)
    } catch (err) {
      reportError(err)
      throw err
    }
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
      selectedServerId: state.selectedServerId === id ? null : state.selectedServerId,
      selectedTool: state.selectedTool?.serverId === id ? null : state.selectedTool,
      selectedResource: state.selectedResource?.serverId === id ? null : state.selectedResource,
      selectedPrompt: state.selectedPrompt?.serverId === id ? null : state.selectedPrompt,
      history: Object.fromEntries(
        Object.entries(state.history).filter(([key]) => !key.startsWith(`${id}::`))
      ),
      resourceHistory: Object.fromEntries(
        Object.entries(state.resourceHistory).filter(([key]) => !key.startsWith(`${id}::`))
      ),
      promptHistory: Object.fromEntries(
        Object.entries(state.promptHistory).filter(([key]) => !key.startsWith(`${id}::`))
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
      const { tools, resources, prompts } = await window.api.mcp.fetchCapabilities(id)
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
    try {
      await window.api.mcp.clearCapabilities(id)
    } catch (err) {
      // A failed cache clear shouldn't strand the refresh; report it but still
      // re-fetch (fetchCapabilities records its own connect errors on the server).
      reportError(err)
    }
    await get().fetchCapabilities(id)
  }
}))
