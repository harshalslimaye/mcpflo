// The JSON-RPC response envelope shape every call outcome shares:
// `{ result }` on success, `{ error }` on a protocol-level failure. Returns
// undefined for a transport failure (no envelope at all) or a JSON-RPC error
// — never for a well-formed result that merely reports a tool-level failure
// (e.g. a tool result with `isError: true` still has a `result` object).
export function extractEnvelopeResult<T>(response: unknown): T | undefined {
  if (typeof response !== 'object' || response === null) return undefined
  const result = (response as { result?: unknown }).result
  if (result === null || typeof result !== 'object') return undefined
  return result as T
}
