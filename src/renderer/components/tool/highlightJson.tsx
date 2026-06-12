// ── lightweight JSON syntax highlighting (no dependency) ───────────────────────
// Matches strings (incl. object keys), booleans/null, and numbers. Anything not
// matched (braces, commas, whitespace) is emitted as-is, so nothing is ever lost.
const JSON_TOKEN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

function tokenClass(token: string): string {
  if (token[0] === '"') {
    return token.trimEnd().endsWith(':') ? 'text-sky-600' : 'text-emerald-600'
  }
  if (token === 'true' || token === 'false') return 'text-purple-600'
  if (token === 'null') return 'text-text-muted'
  return 'text-amber-600'
}

export function highlightJson(json: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  let key = 0
  JSON_TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = JSON_TOKEN.exec(json)) !== null) {
    if (match.index > last) nodes.push(json.slice(last, match.index))
    nodes.push(
      <span key={key++} className={tokenClass(match[0])}>
        {match[0]}
      </span>
    )
    last = match.index + match[0].length
  }
  if (last < json.length) nodes.push(json.slice(last))
  return nodes
}
