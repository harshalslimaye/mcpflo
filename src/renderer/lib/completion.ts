import type { CompletionRef, CompletionOutcome } from '../../shared/mcp.types'

// What a completion typeahead needs to ask for: which server, which prompt
// argument / resource-template variable, what's typed so far, and any
// already-filled sibling arguments (for dependent completion).
export interface CompletionRequest {
  serverId: string
  ref: CompletionRef
  argName: string
  value: string
  contextArgs?: Record<string, string>
}

function refKey(ref: CompletionRef): string {
  return ref.type === 'ref/prompt' ? ref.name : ref.uri
}

// Identity of a completion request: two requests with the same key would get
// the same answer from the server. Used as the cache/dedupe key. Context is
// sorted so key order never causes a spurious cache miss.
export function completionCacheKey(request: CompletionRequest): string {
  const { serverId, ref, argName, value, contextArgs } = request
  const sortedContext = contextArgs
    ? Object.fromEntries(Object.entries(contextArgs).sort(([a], [b]) => a.localeCompare(b)))
    : {}
  return [serverId, ref.type, refKey(ref), argName, value, JSON.stringify(sortedContext)].join('|')
}

// How long the widget (Phase 4) should wait after the last keystroke before
// calling requestCompletion — long enough to coalesce a fast typist's
// keystrokes into one request, short enough that the suggestions still feel
// live. Lives here rather than in the widget so it's covered by this module's
// tests and there's one source of truth for the coordinator's timing.
export const COMPLETION_DEBOUNCE_MS = 180

// A typed field's suggestions don't go stale fast, but a server's data can
// still change — 30s balances "don't hammer the server on every keystroke
// across refocuses" against "don't show week-old values".
export const COMPLETION_TTL_MS = 30_000
// FIFO cap so a long session typing into many different fields can't grow
// this map without bound.
const MAX_CACHE_ENTRIES = 200

const cache = new Map<string, { at: number; outcome: CompletionOutcome }>()

function cacheGet(key: string): CompletionOutcome | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.at > COMPLETION_TTL_MS) {
    cache.delete(key)
    return undefined
  }
  return entry.outcome
}

// A transient failure (timeout, dropped connection) shouldn't be remembered —
// the next keystroke should get a fresh chance. `unsupported` is cached
// despite carrying no values: it's stable for the session (the server's
// declared capabilities don't change mid-connection), so remembering it saves
// a wasted IPC round-trip on every future keystroke into that field.
function isCacheable(outcome: CompletionOutcome): boolean {
  return !outcome.error
}

function cacheSet(key: string, outcome: CompletionOutcome): void {
  if (!isCacheable(outcome)) return
  if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
  cache.set(key, { at: Date.now(), outcome })
}

// Raw round-trip over IPC, uncached and undeduped. Callers should use
// `requestCompletion`, which layers caching and in-flight dedupe on top.
async function fetchCompletion(request: CompletionRequest): Promise<CompletionOutcome> {
  const { serverId, ref, argName, value, contextArgs } = request
  return window.api.mcp.complete(
    serverId,
    ref,
    { name: argName, value },
    contextArgs ? { arguments: contextArgs } : undefined
  )
}

// Requests sharing a key that are still in flight. A widget can fire the same
// request from more than one place in a render (or a caller can retry before
// the first attempt lands); this makes concurrent identical requests share
// one IPC round-trip instead of each opening its own.
const inFlight = new Map<string, Promise<CompletionOutcome>>()

// Asks the server (via main, over IPC) for candidate values for a single
// argument the user is typing — the renderer-side entry point for
// `completion/complete`. Served from a short-lived cache when possible; a
// concurrent identical request in flight is shared rather than duplicated;
// otherwise falls through to a fresh request.
export async function requestCompletion(request: CompletionRequest): Promise<CompletionOutcome> {
  const key = completionCacheKey(request)
  const cached = cacheGet(key)
  if (cached) return cached

  const existing = inFlight.get(key)
  if (existing) return existing

  const pending = fetchCompletion(request).then((outcome) => {
    cacheSet(key, outcome)
    return outcome
  })
  inFlight.set(key, pending)
  // Runs after `pending` settles either way; only clears our own entry, since
  // a newer request may already have replaced it. The `.catch` is just to
  // keep this bookkeeping chain from surfacing as an unhandled rejection —
  // `pending` itself (returned below) still carries the real outcome/error to
  // its actual caller.
  pending
    .finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key)
    })
    .catch(() => {})
  return pending
}

// Drops cached/in-flight completions for one server, or every server when
// called with no id. A stale answer from before a capability refresh,
// disconnect, or sign-out must never be served afterward — the server's
// completions may now differ, or may no longer be reachable at all.
export function clearCompletionCache(serverId?: string): void {
  if (serverId === undefined) {
    cache.clear()
    inFlight.clear()
    return
  }
  const prefix = `${serverId}|`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) inFlight.delete(key)
  }
}
