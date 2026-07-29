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
  ToolCallResult,
  GetPromptResult,
  ResourceReadResult,
  ElicitationRequestEvent,
  ElicitationResult,
  SamplingRequestEvent,
  SamplingResult,
  ServerAuthState,
  AuthEvent
} from '../../shared/mcp.types'
import { capResponse, pushCapped } from '../lib/historyRecord'
import { clearCompletionCache } from '../lib/completion'
import { extractEnvelopeResult } from '../lib/envelope'
import type { ProtocolEvent } from '../lib/activityEvent'
import { useErrorStore, toMessage } from './errorStore'
import type { TestKind, TestRunSummary } from '../../shared/testing.types'
import { resolveToolArgs, resolvePromptArgs } from '../lib/autoArgs'

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
  // Result of running this tool's saved test script against this call's
  // result, when one exists. Undefined (not "empty") whenever no test run was
  // attempted at all — a protocol-level failure (no result to test against)
  // or a tool with no saved script — so the Tests tab can tell "never ran"
  // apart from "ran zero tests".
  testRun?: TestRunSummary
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
  // See ToolCallRecord.testRun. A resource read has no arguments, so there's
  // no saved-inputs concept here — only the saved script matters.
  testRun?: TestRunSummary
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
  // See ToolCallRecord.testRun.
  testRun?: TestRunSummary
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

// Attempts to run this item's saved test script against a just-completed
// call's result, returning the summary (or undefined if none was run).
// Deliberately returns rather than mutating a record in place: the caller
// commits the call's own response to the store first — so the Response panel
// never waits on this — then, once this resolves, patches `testRun` into a
// *new* record object via a second `set()` (Zustand/React only re-render on a
// changed reference, so mutating the already-committed record wouldn't
// actually update anything on screen).
//
// A no-op whenever there's nothing to test against: a protocol-level failure
// with no well-formed result, no `window.api.testing` (real Electron always
// has it via preload), or no saved script. Never throws: a failure running
// tests must not affect the call's own recorded outcome, so it's reported as
// a toast instead.
async function runTestForCall(
  serverId: string,
  kind: TestKind,
  name: string,
  response: unknown,
  callDurationMs: number
): Promise<TestRunSummary | undefined> {
  if (!window.api?.testing) return undefined
  const result = extractEnvelopeResult<ToolCallResult | GetPromptResult | ResourceReadResult>(
    response
  )
  if (!result) return undefined
  try {
    const script = await window.api.testing.getScript(serverId, kind, name)
    if (!script || script.trim() === '') return undefined
    return await window.api.testing.run({ script, kind, result, callDurationMs })
  } catch (err) {
    reportError(err)
    return undefined
  }
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

// A capability's last Tests-tab-triggered run. `skipped` means the capability
// has a saved script but couldn't be auto-invoked — a required tool/prompt
// argument had no value even after layering its marked Saved Request (if any)
// over schema defaults, see lib/autoArgs — distinct from a real pass/fail, so
// the server-level Tests tab doesn't report a false result.
export type TestsTabRunState =
  | { state: 'running' }
  | { state: 'skipped' }
  | { state: 'done'; summary: TestRunSummary }

// Keyed per capability across all three kinds — unlike history's three
// separate maps, a single map is simpler here since callers already have
// `kind` in hand (from listScripts) rather than branching on call type.
export function testsTabKey(serverId: string, kind: TestKind, name: string): string {
  return `${serverId}::${kind}::${name}`
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

// Identifies a selected resource template. Keyed by the template rather than by
// any URI it expands to: the template is what the server lists and what stays
// put while the user tries different variable values.
export interface SelectedResourceTemplate {
  serverId: string
  uriTemplate: string
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
  selectedResourceTemplate: SelectedResourceTemplate | null
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
  // Last Tests-tab-triggered run per capability, keyed by testsTabKey.
  // Session-only (never persisted) and deliberately separate from the per-call
  // `testRun` fields above: those are "this one call's result scored against
  // the script", this is "the Tests tab's own last aggregate run" — a
  // Tests-tab run shouldn't synthesize a fake history entry to hang its result
  // off of.
  testsTabRuns: Record<string, TestsTabRunState>

  hydrate: () => Promise<void>
  selectServer: (id: string | null) => void
  selectTool: (serverId: string, toolName: string) => void
  selectResource: (serverId: string, uri: string) => void
  selectResourceTemplate: (serverId: string, uriTemplate: string) => void
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
  // Cancels an in-flight capability fetch, returning the row to a neutral state.
  cancelFetch: (id: string) => Promise<void>
  refreshCapabilities: (id: string) => Promise<void>
  disconnectServer: (id: string) => Promise<void>
  // OAuth: start (or re-run) the sign-in flow for a server.
  authorizeServer: (id: string) => Promise<void>
  // OAuth: sign out — clears tokens in the main process.
  clearAuth: (id: string) => Promise<void>
  // Applies an OAuth flow event (pushed over mcp:authEvent via AuthHost) to the
  // owning server's `auth` field. Status is never touched here.
  handleAuthEvent: (event: AuthEvent) => void
  // Runs one capability's saved script via a real invocation (best-effort
  // auto-args — see lib/autoArgs) and records the outcome in `testsTabRuns`.
  // A no-op if the capability has no saved script.
  runCapabilityTests: (serverId: string, kind: TestKind, name: string) => Promise<void>
  // Runs every capability with a saved script, sequentially (a manual, once-
  // in-a-while bulk action, not a hot path — no need to parallelize calls
  // against the same server).
  runAllTests: (serverId: string) => Promise<void>
}

function toRuntime(config: LoadedServer, cached?: CachedCapabilities, authed = false): MCPServer {
  // OAuth servers carry an auth field; non-OAuth servers carry none at all. On
  // restart we restore "authenticated" when main reports tokens on disk (see
  // getAuthedServerIds) — otherwise the row would reset to idle and hide its
  // Sign out affordance until a manual reload re-ran the handshake. With no
  // tokens it begins idle, and auth events promote it as a sign-in flow runs.
  const isOAuth = config.transport.type === 'streamable-http' && config.transport.auth === 'oauth'
  return {
    ...config,
    // A cached server starts green (capabilities available); an unfetched one grey.
    status: cached ? 'connected' : 'disconnected',
    tools: cached?.tools ?? [],
    resources: cached?.resources ?? [],
    resourceTemplates: cached?.resourceTemplates ?? [],
    prompts: cached?.prompts ?? [],
    fetchedAt: cached?.fetchedAt,
    features: cached?.features,
    ...(isOAuth
      ? { auth: { status: authed ? ('authenticated' as const) : ('idle' as const) } }
      : {})
  }
}

// The state a server drops back to when its session is torn down — disconnect
// and sign-out both land here, and main clears the on-disk cache to match.
// Every capability listing belongs in this one object: one left out survives
// the teardown and keeps rendering as though the server were still connected,
// which also holds the context budget above zero and so keeps the cards that
// hide themselves on an empty server on screen.
//
// A function rather than a constant so each call gets its own arrays — a shared
// literal would hand the same array instance to every torn-down server.
function clearedSession(): Pick<
  MCPServer,
  'status' | 'error' | 'tools' | 'resources' | 'resourceTemplates' | 'prompts' | 'fetchedAt'
> {
  return {
    status: 'disconnected',
    error: undefined,
    tools: [],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    fetchedAt: undefined
  }
}

export const useServerStore = create<ServerStore>((set, get) => ({
  servers: [],
  selectedServerId: null,
  selectedTool: null,
  selectedResource: null,
  selectedResourceTemplate: null,
  selectedPrompt: null,
  history: {},
  resourceHistory: {},
  promptHistory: {},
  protocolEvents: [],
  pendingPrefill: null,
  liveNotifications: {},
  pendingElicitations: [],
  pendingSamplings: [],
  testsTabRuns: {},

  hydrate: async () => {
    try {
      const [configs, cache, authedIds] = await Promise.all([
        window.api.mcp.getServers(),
        window.api.mcp.getCachedCapabilities(),
        window.api.mcp.getAuthedServerIds()
      ])
      const authed = new Set(authedIds)
      // The server list lands first, on its own. Everything below it is a
      // nicety built from the same cache, and a nicety must never be able to
      // take the list down with it — a user who sees no servers assumes their
      // data is gone.
      set({ servers: configs.map((c) => toRuntime(c, cache[c.id], authed.has(c.id))) })
      try {
        // Replay each cached server's capability listing into the activity log so
        // the "All" tab isn't empty on a cached startup. These are badged `cache`
        // (and stamped at the cache's own fetch time, so their age is honest) —
        // and deliberately carry no `connect` event, since no handshake happened.
        const cachedEvents: ProtocolEvent[] = configs.flatMap((c) => {
          const cached = cache[c.id]
          if (!cached) return []
          const list = (
            kind: 'list-tools' | 'list-resources' | 'list-resource-templates' | 'list-prompts',
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
            list(
              'list-resource-templates',
              `${cached.resourceTemplates?.length ?? 0} resource templates`
            ),
            list('list-prompts', `${cached.prompts.length} prompts`)
          ]
        })
        set({ protocolEvents: cachedEvents })
      } catch (err) {
        // Worst case the timeline starts empty; the servers are already in.
        reportError(err)
      }
    } catch (err) {
      // A startup read failure would otherwise leave the app blank with no
      // explanation; surface it instead.
      reportError(err)
    }
  },

  // Server selection and leaf selection are mutually exclusive with each other —
  // the content area shows exactly one detail view — so selecting a server
  // clears any selected leaf, and selecting a leaf clears the server and the
  // other three leaves. Every selector below must null every other selection:
  // miss one and two detail views render at once.
  selectServer: (id) =>
    set({
      selectedServerId: id,
      selectedTool: null,
      selectedResource: null,
      selectedResourceTemplate: null,
      selectedPrompt: null
    }),

  selectTool: (serverId, toolName) =>
    set({
      selectedTool: { serverId, toolName },
      selectedResource: null,
      selectedResourceTemplate: null,
      selectedPrompt: null,
      selectedServerId: null
    }),

  selectResource: (serverId, uri) =>
    set({
      selectedResource: { serverId, uri },
      selectedTool: null,
      selectedResourceTemplate: null,
      selectedPrompt: null,
      selectedServerId: null
    }),

  selectResourceTemplate: (serverId, uriTemplate) =>
    set({
      selectedResourceTemplate: { serverId, uriTemplate },
      selectedTool: null,
      selectedResource: null,
      selectedPrompt: null,
      selectedServerId: null
    }),

  selectPrompt: (serverId, promptName) =>
    set({
      selectedPrompt: { serverId, promptName },
      selectedTool: null,
      selectedResource: null,
      selectedResourceTemplate: null,
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
      const outcome = await window.api.mcp.callTool(serverId, toolName, args, callId, taskSupport)
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

    // Auto-run this tool's saved test script against the result, if any —
    // after the response above is already committed and visible, so a slow
    // first-ever run (QuickJS's WASM cold-compile) never delays the Response
    // panel. See runTestForCall: no-ops on a transport/protocol failure with
    // no result; a tool result reporting `isError: true` is still a real
    // result, the whole point of `res.getIsError()`, so that case still runs.
    if (record) {
      const recordId = record.id
      const testRun = await runTestForCall(
        serverId,
        'tool',
        toolName,
        record.response,
        record.durationMs
      )
      if (testRun) {
        set((state) => ({
          history: {
            ...state.history,
            [key]: (state.history[key] ?? []).map((r) =>
              r.id === recordId ? { ...r, testRun } : r
            )
          }
        }))
      }
    }
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
      const outcome = await window.api.mcp.readResource(serverId, uri)
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

    // Resources have no arguments, so there's nothing to save inputs for —
    // just the saved script, if any. Run after the read above is already
    // committed — see executeTool's runTestForCall comment.
    const testRun = await runTestForCall(
      serverId,
      'resource',
      uri,
      committed.response,
      committed.durationMs
    )
    if (testRun) {
      set((state) => ({
        resourceHistory: {
          ...state.resourceHistory,
          [key]: (state.resourceHistory[key] ?? []).map((r) =>
            r.id === committed.id ? { ...r, testRun } : r
          )
        }
      }))
    }
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
      const outcome = await window.api.mcp.getPrompt(serverId, promptName, args)
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

    // Run after the get above is already committed — see executeTool's
    // runTestForCall comment.
    const testRun = await runTestForCall(
      serverId,
      'prompt',
      promptName,
      committed.response,
      committed.durationMs
    )
    if (testRun) {
      set((state) => ({
        promptHistory: {
          ...state.promptHistory,
          [key]: (state.promptHistory[key] ?? []).map((r) =>
            r.id === committed.id ? { ...r, testRun } : r
          )
        }
      }))
    }
  },

  clearPromptHistory: (serverId, promptName) => {
    const key = promptKey(serverId, promptName)
    set((state) => {
      const next = { ...state.promptHistory }
      delete next[key]
      return { promptHistory: next }
    })
  },

  runCapabilityTests: async (serverId, kind, name) => {
    const server = get().servers.find((s) => s.id === serverId)
    if (!server) return
    const key = testsTabKey(serverId, kind, name)

    function clearRun(): void {
      set((state) => {
        const next = { ...state.testsTabRuns }
        delete next[key]
        return { testsTabRuns: next }
      })
    }

    const script = await window.api.testing.getScript(serverId, kind, name)
    if (!script || script.trim() === '') {
      clearRun()
      return
    }

    // Args per kind — a resource read takes none at all. The single source
    // for tools/prompts is whichever Saved Request is marked "use for tests"
    // on that capability's own Saved tab, layered over schema defaults;
    // there is no other fallback (e.g. no last-executed-args cache). `ok:
    // false` means a required field is still unset after that, so the
    // capability is marked "skipped" rather than invoked with guessed args.
    let toolArgs: Record<string, unknown> = {}
    let promptArgs: Record<string, string> = {}
    if (kind === 'tool' || kind === 'prompt') {
      // Best-effort — a failed read here must not abort the rest of a bulk
      // "Run all tests" pass over one capability's metadata.
      const requestsFile = await window.api.testing
        .getRequests(serverId, kind, name)
        .catch(() => null)
      const marked = requestsFile?.requests.find((r) => r.id === requestsFile.testRequestId)
      const testArgs = marked?.args ?? null

      if (kind === 'tool') {
        const tool = server.tools.find((t) => t.name === name)
        if (!tool) return
        const resolved = resolveToolArgs(tool, testArgs)
        if (!resolved.ok) {
          set((state) => ({
            testsTabRuns: { ...state.testsTabRuns, [key]: { state: 'skipped' } }
          }))
          return
        }
        toolArgs = resolved.args
      } else {
        const prompt = server.prompts.find((p) => p.name === name)
        if (!prompt) return
        const resolved = resolvePromptArgs(prompt, testArgs)
        if (!resolved.ok) {
          set((state) => ({
            testsTabRuns: { ...state.testsTabRuns, [key]: { state: 'skipped' } }
          }))
          return
        }
        promptArgs = resolved.args as Record<string, string>
      }
    }

    set((state) => ({ testsTabRuns: { ...state.testsTabRuns, [key]: { state: 'running' } } }))

    const at = Date.now()
    try {
      const outcome =
        kind === 'tool'
          ? await window.api.mcp.callTool(serverId, name, toolArgs)
          : kind === 'resource'
            ? await window.api.mcp.readResource(serverId, name)
            : await window.api.mcp.getPrompt(serverId, name, promptArgs)

      if (outcome.authRequired) {
        get().handleAuthEvent({ type: 'auth_required', serverId })
        clearRun()
        return
      }

      const result = extractEnvelopeResult<ToolCallResult | GetPromptResult | ResourceReadResult>(
        outcome.response
      )
      if (!result) {
        // Transport/protocol failure — nothing well-formed to score against a
        // script, so this capability goes back to "not tested" rather than a
        // misleading pass/fail.
        clearRun()
        return
      }

      const summary = await window.api.testing.run({
        script,
        kind,
        result,
        callDurationMs: Date.now() - at
      })
      set((state) => ({
        testsTabRuns: { ...state.testsTabRuns, [key]: { state: 'done', summary } }
      }))
    } catch (err) {
      reportError(err)
      clearRun()
    }
  },

  runAllTests: async (serverId) => {
    const scripts = await window.api.testing.listScripts(serverId)
    // Sequential: this is a manual, occasional bulk action against one
    // server, not a hot path — no need to fire every call concurrently.
    for (const { kind, name } of scripts) {
      await get().runCapabilityTests(serverId, kind, name)
    }
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
    // Merge the redacted server the main process hands back — never the raw
    // `config` the user just typed — so a freshly-entered secret (env, headers,
    // OAuth clientSecret) never lands in renderer state. The secret exists only
    // transiently in the Add form's local input while being entered.
    let loaded: LoadedServer
    try {
      loaded = await window.api.mcp.addServer(config)
    } catch (err) {
      // Toast for the user, then re-throw so the modal stays open instead of
      // silently dismissing as if the add succeeded.
      reportError(err)
      throw err
    }
    set((state) => ({ servers: [...state.servers, toRuntime(loaded)] }))
  },

  updateServer: async (id, patch) => {
    // As in addServer: merge the redacted server returned by main, not the raw
    // patch, so an edit that carries a secret (e.g. DCR recovery) doesn't leave
    // the plaintext value in renderer state.
    let loaded: LoadedServer
    try {
      loaded = await window.api.mcp.updateServer(id, patch)
    } catch (err) {
      reportError(err)
      throw err
    }
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...loaded } : s))
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
      selectedResourceTemplate:
        state.selectedResourceTemplate?.serverId === id ? null : state.selectedResourceTemplate,
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

    // A cancel (or disconnect) moves the row off 'connecting' while we await; if
    // that happened, the user abandoned this fetch — discard its outcome rather
    // than overwrite the neutral state they asked for.
    const cancelled = (): boolean => get().servers.find((s) => s.id === id)?.status !== 'connecting'

    try {
      const result = await window.api.mcp.fetchCapabilities(id)
      if (cancelled()) return
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
      const { tools, resources, prompts, features } = result
      // Optional over the wire (a server that doesn't support the method yields
      // nothing), required on the runtime server.
      const resourceTemplates = result.resourceTemplates ?? []
      const finishedAt = Date.now()
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id
            ? {
                ...s,
                status: 'connected',
                tools,
                resources,
                resourceTemplates,
                prompts,
                fetchedAt: finishedAt,
                features
              }
            : s
        ),
        // The handshake precedes the listings (earlier `at`); all five land here.
        protocolEvents: [
          proto('list-prompts', 'success', `${prompts.length} prompts`, finishedAt),
          proto(
            'list-resource-templates',
            'success',
            `${resourceTemplates.length} resource templates`,
            finishedAt
          ),
          proto('list-resources', 'success', `${resources.length} resources`, finishedAt),
          proto('list-tools', 'success', `${tools.length} tools`, finishedAt),
          proto('connect', 'success', 'initialized', startedAt),
          ...state.protocolEvents
        ]
      }))
    } catch (err) {
      if (cancelled()) return
      const message = err instanceof Error ? err.message : String(err)
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, status: 'error', error: message } : s
        ),
        protocolEvents: [proto('connect', 'error', message, startedAt), ...state.protocolEvents]
      }))
    }
  },

  // Cancels an in-flight fetch: optimistically return the row to a neutral
  // disconnected state (so the awaiting fetchCapabilities discards its outcome),
  // then tell the main process to abort the connect/listing it's blocked on.
  cancelFetch: async (id) => {
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id ? { ...s, status: 'disconnected', error: undefined } : s
      )
    }))
    try {
      await window.api.mcp.cancelCapabilities(id)
    } catch (err) {
      reportError(err)
    }
  },

  // Clears the cache and fetches again — the manual "refresh" action.
  refreshCapabilities: async (id) => {
    // A cached completion answered under the old capabilities/data must not
    // survive into the refreshed connection.
    clearCompletionCache(id)
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
    // The connection is going away — any cached/in-flight completion for it
    // is now unreachable and must not be served if the server reconnects.
    clearCompletionCache(id)
    try {
      await window.api.mcp.disconnectServer(id)
      await window.api.mcp.clearCapabilities(id)
    } catch (err) {
      reportError(err)
    }
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...clearedSession() } : s))
    }))
  },

  authorizeServer: async (id) => {
    const server = get().servers.find((s) => s.id === id)
    if (!server) return
    // Optimistic: show the in-progress affordance before the browser opens. The
    // 'pending' auth event would set the same state once the 401 lands.
    get().handleAuthEvent({ type: 'pending', serverId: id })
    try {
      await window.api.mcp.authorizeServer(id)
    } catch (err) {
      reportError(err)
      // The flow rejected; if no 'error' event arrived to move us off
      // 'authenticating', fall back to auth_required so the row isn't stuck.
      get().handleAuthEvent({ type: 'auth_required', serverId: id })
    }
  },

  clearAuth: async (id) => {
    // Same reasoning as disconnectServer — the session is torn down here too.
    clearCompletionCache(id)
    try {
      // Main disconnects the session, clears tokens, clears cached capabilities,
      // then pushes an 'idle' auth event which resets the auth field. Since the
      // live session is genuinely torn down, mirror disconnectServer's local
      // reset here too — otherwise the row would keep rendering green with its
      // (now unreachable) capabilities still listed.
      await window.api.mcp.clearAuth(id)
    } catch (err) {
      reportError(err)
    }
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...clearedSession() } : s))
    }))
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
