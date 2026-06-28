// In-memory call history is bounded so a long session — or a few tools that
// return very large responses — can't grow the renderer heap without limit.

// Max records kept per tool/resource/prompt key; older ones are dropped.
export const HISTORY_LIMIT_PER_KEY = 50

// Max serialized response size (chars, a cheap proxy for bytes) to retain in a
// record. A response larger than this is dropped and flagged truncated.
export const RESPONSE_BUDGET = 256_000

// True for an MCP-UI resource: the `ui://` scheme (an app-defined UI resource)
// or a `text/html` mimeType tagged `profile=mcp-app`. These embed a full
// HTML/JS widget bundle as their content — routinely past RESPONSE_BUDGET —
// and exist to be rendered, not diffed across history entries, so they're
// exempt from the size cap rather than silently dropped.
function isMcpUiResource(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false
  const { uri, mimeType } = item as { uri?: unknown; mimeType?: unknown }
  if (typeof uri === 'string' && uri.startsWith('ui://')) return true
  return typeof mimeType === 'string' && mimeType.includes('profile=mcp-app')
}

// Scans the content blocks a response can carry an MCP-UI resource in: a
// resource-read result's `contents`, and a tool-call/prompt-message result's
// `content` (where it appears as a `resource` block's nested `resource`, or
// directly on a `resource_link` block).
function containsMcpUiResource(response: unknown): boolean {
  if (typeof response !== 'object' || response === null) return false
  const result = (response as { result?: unknown }).result
  if (typeof result !== 'object' || result === null) return false

  const contents = (result as { contents?: unknown }).contents
  if (Array.isArray(contents) && contents.some(isMcpUiResource)) return true

  const content = (result as { content?: unknown }).content
  if (Array.isArray(content)) {
    return content.some(
      (block) =>
        typeof block === 'object' &&
        block !== null &&
        (isMcpUiResource(block) || isMcpUiResource((block as { resource?: unknown }).resource))
    )
  }
  return false
}

// Decides whether a response is small enough to keep. Oversized responses are
// dropped (the blob is the memory cost) and flagged so the UI can say so. A
// non-serializable response (cyclic, etc.) is kept as-is rather than dropped —
// it's small by construction and JSON.stringify would have thrown downstream.
// An MCP-UI resource bypasses the budget entirely (see isMcpUiResource).
export function capResponse(response: unknown): { response: unknown; truncated: boolean } {
  if (containsMcpUiResource(response)) {
    return { response, truncated: false }
  }
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(response)
  } catch {
    return { response, truncated: false }
  }
  if (serialized !== undefined && serialized.length > RESPONSE_BUDGET) {
    return { response: undefined, truncated: true }
  }
  return { response, truncated: false }
}

// Prepends `record` to a newest-first list and caps it to HISTORY_LIMIT_PER_KEY,
// dropping the oldest. Treats a missing list as empty.
export function pushCapped<T>(list: T[] | undefined, record: T): T[] {
  return [record, ...(list ?? [])].slice(0, HISTORY_LIMIT_PER_KEY)
}
