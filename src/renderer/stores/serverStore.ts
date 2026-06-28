import { create } from 'zustand'
import type {
  ServerConfig,
  LoadedServer,
  MCPServer,
  CachedCapabilities,
  ToolCallOutcome,
  ResourceReadOutcome,
  PromptGetOutcome,
  ToolCallNotification,
  ElicitationRequestEvent,
  ElicitationResult,
  SamplingRequestEvent,
  SamplingResult,
  ServerAuthState,
  AuthEvent
} from '../../shared/mcp.types'
import { capResponse, pushCapped } from '../lib/historyRecord'
import type { ProtocolEvent } from '../lib/activityEvent'
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
  // Protocol-level events (connection handshakes, capability listings) that have
  // no per-key home, newest first. Merged with the call histories to build the
  // "All" history tab; see lib/activityEvent.
  protocolEvents: ProtocolEvent[]
  // A one-shot request to re-fill a tool/prompt form with a past call's args,
  // set when a call row is activated from the "All" tab (which navigates to
  // another entity, so the args can't ride along in the detail view's local
  // state). `nonce` (a timestamp, disjoint from the small per-view nonces) lets
  // the target form apply it once; the view clears it on arrival.
  pendingPrefill: {
    serverId: string
    name: string
    args: Record<string, unknown>
    nonce: number
  } | null
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
  selectResource: (serverId: string, uri: string) => void
  selectPrompt: (serverId: string, promptName: string) => void
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<void>
  clearHistory: (serverId: string, toolName: string) => void
  readResource: (serverId: string, uri: string) => Promise<void>
  clearResourceHistory: (serverId: string, uri: string) => void
  getPrompt: (serverId: string, promptName: string, args: Record<string, string>) => Promise<void>
  clearPromptHistory: (serverId: string, promptName: string) => void
  // Clears every history slice at once — backs the "clear" control on the "All"
  // history tab.
  clearAllActivity: () => void
  // Stages / clears the cross-tab form prefill handoff (see pendingPrefill).
  setPendingPrefill: (prefill: {
    serverId: string
    name: string
    args: Record<string, unknown>
  }) => void
  clearPendingPrefill: () => void
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
  disconnectServer: (id: string) => Promise<void>
  // OAuth: start (or re-run) the sign-in flow for a server.
  authorizeServer: (id: string) => Promise<void>
  // OAuth: sign out — clears tokens in the main process.
  clearAuth: (id: string) => Promise<void>
  // Applies an OAuth flow event (pushed over mcp:authEvent via AuthHost) to the
  // owning server's `auth` field. Status is never touched here.
  handleAuthEvent: (event: AuthEvent) => void
}

function toRuntime(config: LoadedServer, cached?: CachedCapabilities): MCPServer {
  // OAuth servers begin idle (not signed in); auth events promote them as the
  // flow progresses (and on restart, a silent token-based reconnect emits
  // success). Non-OAuth servers carry no auth field at all.
  const isOAuth = config.transport.type === 'streamable-http' && config.transport.auth === 'oauth'
  return {
    ...config,
    // A cached server starts green (capabilities available); an unfetched one grey.
    status: cached ? 'connected' : 'disconnected',
    tools: cached?.tools ?? [],
    resources: cached?.resources ?? [],
    prompts: cached?.prompts ?? [],
    fetchedAt: cached?.fetchedAt,
    ...(isOAuth ? { auth: { status: 'idle' as const } } : {})
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
  protocolEvents: [],
  pendingPrefill: null,
  liveNotifications: {},
  pendingElicitations: [],
  pendingSamplings: [],

  hydrate: async () => {
    try {
      const [configs, cache] = await Promise.all([
        window.api.mcp.getServers(),
        window.api.mcp.getCachedCapabilities()
      ])
      // Replay each cached server's capability listing into the activity log so
      // the "All" tab isn't empty on a cached startup. These are badged `cache`
      // (and stamped at the cache's own fetch time, so their age is honest) —
      // and deliberately carry no `connect` event, since no handshake happened.
      const cachedEvents: ProtocolEvent[] = configs.flatMap((c) => {
        const cached = cache[c.id]
        if (!cached) return []
        const list = (
          kind: 'list-tools' | 'list-resources' | 'list-prompts',
          detail: string
        ): ProtocolEvent => ({
          id: crypto.randomUUID(),
          kind,
          serverId: c.id,
          serverName: c.name,
          status: 'success',
          detail,
          source: 'cache',
          durationMs: 0,
          at: cached.fetchedAt
        })
        return [
          list('list-tools', `${cached.tools.length} tools`),
          list('list-resources', `${cached.resources.length} resources`),
          list('list-prompts', `${cached.prompts.length} prompts`)
        ]
      })
      set({ servers: configs.map((c) => toRuntime(c, cache[c.id])), protocolEvents: cachedEvents })
    } catch (err) {
      // A startup read failure would otherwise leave the app blank with no
      // explanation; surface it instead.
      reportError(err)
    }
  },

  // Server selection and tool/resource/prompt selection are mutually
  // exclusive with each other — the content area shows exactly one detail
  // view — so selecting a server clears any selected leaf.
  selectServer: (id) =>
    set({ selectedServerId: id, selectedTool: null, selectedResource: null, selectedPrompt: null }),

  // Tool, resource and prompt selection are mutually exclusive with each
  // other and with the server selection — selecting one clears the rest.
  selectTool: (serverId, toolName) =>
    set({
      selectedTool: { serverId, toolName },
      selectedResource: null,
      selectedPrompt: null,
      selectedServerId: null
    }),

  selectResource: (serverId, uri) =>
    set({
      selectedResource: { serverId, uri },
      selectedTool: null,
      selectedPrompt: null,
      selectedServerId: null
    }),

  selectPrompt: (serverId, promptName) =>
    set({
      selectedPrompt: { serverId, promptName },
      selectedTool: null,
      selectedResource: null,
      selectedServerId: null
    }),

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
    // Null when the call ended in an auth-required outcome: that's not a failed
    // invocation, so it flips the server to "needs sign-in" without leaving a
    // blank, message-less error record behind in history.
    let record: ToolCallRecord | null = null
    try {
      const taskSupport = server.tools.find((t) => t.name === toolName)?.execution?.taskSupport
      const outcome = await window.api.mcp.callTool(server, toolName, args, callId, taskSupport)
      if (outcome.authRequired) {
        get().handleAuthEvent({ type: 'auth_required', serverId })
      } else {
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
        history: record
          ? { ...state.history, [key]: pushCapped(state.history[key], record) }
          : state.history,
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
    // Null on an auth-required outcome — see executeTool: no phantom error record.
    let record: ResourceReadRecord | null = null
    try {
      const outcome = await window.api.mcp.readResource(server, uri)
      if (outcome.authRequired) {
        get().handleAuthEvent({ type: 'auth_required', serverId })
      } else {
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

    if (!record) return
    const committed = record
    set((state) => ({
      resourceHistory: {
        ...state.resourceHistory,
        [key]: pushCapped(state.resourceHistory[key], committed)
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
    // Null on an auth-required outcome — see executeTool: no phantom error record.
    let record: PromptGetRecord | null = null
    try {
      const outcome = await window.api.mcp.getPrompt(server, promptName, args)
      if (outcome.authRequired) {
        get().handleAuthEvent({ type: 'auth_required', serverId })
      } else {
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

    if (!record) return
    const committed = record
    set((state) => ({
      promptHistory: {
        ...state.promptHistory,
        [key]: pushCapped(state.promptHistory[key], committed)
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

  clearAllActivity: () =>
    set({
      history: {},
      resourceHistory: {},
      promptHistory: {},
      protocolEvents: [],
      // A "clear all" should also drop any staged cross-tab prefill, so a pending
      // handoff can't outlive the history it came from.
      pendingPrefill: null
    }),

  // Timestamp nonce keeps each handoff distinct from the small, independent
  // per-view prefill nonces, so the two never collide in the shared form prop.
  setPendingPrefill: (prefill) => set({ pendingPrefill: { ...prefill, nonce: Date.now() } }),

  clearPendingPrefill: () => set({ pendingPrefill: null }),

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
    set((state) => ({ servers: [...state.servers, toRuntime(config)] }))
  },

  updateServer: async (id, patch) => {
    try {
      await window.api.mcp.updateServer(id, patch)
    } catch (err) {
      reportError(err)
      throw err
    }
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...patch } : s))
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
      ),
      protocolEvents: state.protocolEvents.filter((e) => e.serverId !== id),
      // Drop a staged prefill handoff belonging to the removed server, so it
      // can't linger and fill a later form.
      pendingPrefill: state.pendingPrefill?.serverId === id ? null : state.pendingPrefill
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

    // Stamps a protocol event for this server. `connect` carries the initialize
    // handshake; the list-* kinds carry each capability listing the fetch does.
    const startedAt = Date.now()
    const proto = (
      kind: ProtocolEvent['kind'],
      status: ProtocolEvent['status'],
      detail: string,
      at: number
    ): ProtocolEvent => ({
      id: crypto.randomUUID(),
      kind,
      serverId: id,
      serverName: server.name,
      status,
      detail,
      source: 'live',
      durationMs: Date.now() - startedAt,
      at
    })

    try {
      const result = await window.api.mcp.fetchCapabilities(server)
      // Sign-in needed (token expired/rejected, or DCR unsupported with no Client
      // ID): the auth event already moved `auth` to auth_required — and, for DCR,
      // opened the recovery modal. Drop back to a neutral disconnected state
      // rather than a red error; signing in, not a failed fetch, is what's needed.
      if (result.authRequired) {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, status: 'disconnected', error: undefined } : s
          )
        }))
        return
      }
      const { tools, resources, prompts } = result
      const finishedAt = Date.now()
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id
            ? { ...s, status: 'connected', tools, resources, prompts, fetchedAt: finishedAt }
            : s
        ),
        // The handshake precedes the listings (earlier `at`); all four land here.
        protocolEvents: [
          proto('list-prompts', 'success', `${prompts.length} prompts`, finishedAt),
          proto('list-resources', 'success', `${resources.length} resources`, finishedAt),
          proto('list-tools', 'success', `${tools.length} tools`, finishedAt),
          proto('connect', 'success', 'initialized', startedAt),
          ...state.protocolEvents
        ]
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, status: 'error', error: message } : s
        ),
        protocolEvents: [proto('connect', 'error', message, startedAt), ...state.protocolEvents]
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
  },

  // Tears down the live connection and clears its cached capabilities (not its
  // config), resetting the server to its never-fetched (grey) state so the next
  // expand reconnects and refetches via the existing lazy-fetch path.
  disconnectServer: async (id) => {
    try {
      await window.api.mcp.disconnectServer(id)
      await window.api.mcp.clearCapabilities(id)
    } catch (err) {
      reportError(err)
    }
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id
          ? {
              ...s,
              status: 'disconnected',
              error: undefined,
              tools: [],
              resources: [],
              prompts: [],
              fetchedAt: undefined
            }
          : s
      )
    }))
  },

  authorizeServer: async (id) => {
    const server = get().servers.find((s) => s.id === id)
    if (!server) return
    // Optimistic: show the in-progress affordance before the browser opens. The
    // 'pending' auth event would set the same state once the 401 lands.
    get().handleAuthEvent({ type: 'pending', serverId: id })
    try {
      await window.api.mcp.authorizeServer(server)
    } catch (err) {
      reportError(err)
      // The flow rejected; if no 'error' event arrived to move us off
      // 'authenticating', fall back to auth_required so the row isn't stuck.
      get().handleAuthEvent({ type: 'auth_required', serverId: id })
    }
  },

  clearAuth: async (id) => {
    try {
      // Main disconnects the session, clears tokens, then pushes an 'idle' auth
      // event which resets the field.
      await window.api.mcp.clearAuth(id)
    } catch (err) {
      reportError(err)
    }
  },

  handleAuthEvent: (event) => {
    // dcr_required carries no reason: it's the structured "registration
    // unsupported" signal that AuthHost turns into the recovery modal, so the
    // sign-in affordance shows no tooltip text (never "Sign in (DCR_FAILED)").
    const next: ServerAuthState =
      event.type === 'pending'
        ? { status: 'authenticating' }
        : event.type === 'success'
          ? { status: 'authenticated' }
          : event.type === 'idle'
            ? { status: 'idle' }
            : event.type === 'dcr_required'
              ? { status: 'auth_required' }
              : { status: 'auth_required', reason: event.reason }
    set((state) => ({
      servers: state.servers.map((s) => (s.id === event.serverId ? { ...s, auth: next } : s))
    }))
  }
}))
