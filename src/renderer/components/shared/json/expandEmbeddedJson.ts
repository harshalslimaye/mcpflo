// MCP tools routinely return their structured payload as a *stringified* JSON
// blob inside a `text` content block. Serialized as-is, that shows up on the
// Pretty tab as one escaped one-liner ("{\"foo\":1}") — unreadable. This walk
// replaces any such string with its parsed value so it renders as real nested
// structure. Only object/array roots are expanded (matching the Preview tab's
// rule); bare numbers, quoted scalars and non-JSON text are left untouched.

// Parse `text` only if it is JSON encoding an object or array; otherwise undefined.
function tryParseJsonContainer(text: string): object | undefined {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

// Deep-clone `value`, expanding embedded-JSON strings at every depth. The result
// is a fresh structure; the input is never mutated.
export function expandEmbeddedJson(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = tryParseJsonContainer(value)
    // Recurse into the parsed value: payloads are occasionally double-encoded.
    return parsed === undefined ? value : expandEmbeddedJson(parsed)
  }
  if (Array.isArray(value)) return value.map(expandEmbeddedJson)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) out[key] = expandEmbeddedJson(val)
    return out
  }
  return value
}
