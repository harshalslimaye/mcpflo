import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { ServerConfig, CompletionRef, CompletionOutcome } from '../../shared/mcp.types'
import { getSession, handleOperationAuthError } from './session'

// A typeahead that hangs is worse than one that gives up.
const COMPLETION_TIMEOUT_MS = 5000
// The spec caps completion values at 100; slicing defensively in case a
// server ignores that.
const MAX_VALUES = 100

// One in-flight completion per field (server + ref + argument name). A newer
// request for the same field supersedes the older one — the user kept typing,
// so the older response would just be stale UI noise by the time it lands.
const inFlight = new Map<string, AbortController>()

function refKey(ref: CompletionRef): string {
  return ref.type === 'ref/prompt' ? ref.name : ref.uri
}

function fieldKey(serverId: string, ref: CompletionRef, argName: string): string {
  return `${serverId}|${ref.type}:${refKey(ref)}|${argName}`
}

// Asks a server for candidate values for a single argument the user is typing
// (completion/complete) — the MCP protocol's autocomplete, scoped to prompt
// arguments and resource-template variables (the only two `ref` types the
// spec defines; there is no tool-argument completion).
//
// Never throws: this backs a background typeahead, so a failed, unsupported,
// or superseded request is a silent no-op for the renderer, not an error to
// surface.
export async function completeArgument(
  config: ServerConfig,
  ref: CompletionRef,
  argument: { name: string; value: string },
  context?: { arguments?: Record<string, string> }
): Promise<CompletionOutcome> {
  let session: Awaited<ReturnType<typeof getSession>>
  try {
    session = await getSession(config)
  } catch (err) {
    if (err instanceof UnauthorizedError) return { values: [], authRequired: true }
    // A pre-response failure (spawn/connection error, unsupported transport).
    return { values: [], error: err instanceof Error ? err.message : String(err) }
  }

  // Main-process gate = correctness: read live off the negotiated handshake
  // rather than trusting the renderer's (possibly stale) cached flag. No
  // request is sent when the server never declared the capability.
  if (session.client.getServerCapabilities()?.completions === undefined) {
    return { values: [], unsupported: true }
  }

  const key = fieldKey(config.id, ref, argument.name)
  inFlight.get(key)?.abort()
  const controller = new AbortController()
  inFlight.set(key, controller)

  const hasContext = context?.arguments && Object.keys(context.arguments).length > 0

  try {
    const result = await session.client.complete(
      { ref, argument, ...(hasContext ? { context } : {}) },
      { signal: controller.signal, timeout: COMPLETION_TIMEOUT_MS }
    )
    return {
      values: result.completion.values.slice(0, MAX_VALUES),
      total: result.completion.total,
      hasMore: result.completion.hasMore
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      handleOperationAuthError(config.id)
      return { values: [], authRequired: true }
    }
    // A newer request for this same field aborted us — the renderer has
    // already moved on, so this isn't a real failure.
    if (controller.signal.aborted) return { values: [], error: 'superseded' }
    return { values: [], error: err instanceof Error ? err.message : String(err) }
  } finally {
    // Only clear our own entry — a newer request may have already replaced it.
    if (inFlight.get(key) === controller) inFlight.delete(key)
  }
}
