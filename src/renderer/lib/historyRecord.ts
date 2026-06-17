// In-memory call history is bounded so a long session — or a few tools that
// return very large responses — can't grow the renderer heap without limit.

// Max records kept per tool/resource/prompt key; older ones are dropped.
export const HISTORY_LIMIT_PER_KEY = 50

// Max serialized response size (chars, a cheap proxy for bytes) to retain in a
// record. A response larger than this is dropped and flagged truncated.
export const RESPONSE_BUDGET = 256_000

// Decides whether a response is small enough to keep. Oversized responses are
// dropped (the blob is the memory cost) and flagged so the UI can say so. A
// non-serializable response (cyclic, etc.) is kept as-is rather than dropped —
// it's small by construction and JSON.stringify would have thrown downstream.
export function capResponse(response: unknown): { response: unknown; truncated: boolean } {
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
