import { useState } from 'react'
import { Copy, Check, AlertCircle } from 'lucide-react'
import type { ToolCallRecord } from '../../stores/serverStore'
import type { ToolCallResult } from '../../../shared/mcp.types'
import { ResultPreview } from './ContentBlockPreview'

export type ResultTab = 'preview' | 'raw' | 'pretty'

const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'preview', label: 'Preview' },
  { key: 'raw', label: 'Raw' },
  { key: 'pretty', label: 'Pretty' }
]

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

function highlightJson(json: string): React.ReactNode[] {
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

function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  function copy(): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy JSON"
      className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border bg-bg-primary text-text-muted hover:text-text-primary transition-colors"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

interface ToolCallResultViewProps {
  record: ToolCallRecord
  tab: ResultTab
  onTabChange: (tab: ResultTab) => void
}

export function ToolCallResultView({
  record,
  tab,
  onTabChange
}: ToolCallResultViewProps): React.JSX.Element {
  const isError = record.status === 'error'

  const statusLine = (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`} />
      {isError && <AlertCircle size={12} className="text-red-500" aria-label="Error icon" />}
      <span className={isError ? 'text-red-500' : 'text-text-primary'}>
        {isError ? 'Error' : 'Success'}
      </span>
      <span className="text-text-muted">{record.durationMs} ms</span>
    </div>
  )

  // No JSON-RPC response arrived (connection/transport failure) — there's no
  // envelope to show, so surface the error message instead.
  if (record.response === undefined) {
    return (
      <div className="flex flex-col gap-2">
        {statusLine}
        <pre className="font-mono text-xs leading-relaxed border border-red-500/40 bg-red-500/5 text-red-500 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap break-words">
          {record.error ?? 'No response received.'}
        </pre>
      </div>
    )
  }

  const compact = JSON.stringify(record.response)
  const pretty = JSON.stringify(record.response, null, 2)

  // The CallToolResult lives inside the JSON-RPC envelope; a JSON-RPC error
  // envelope carries `error` instead and has no tool result to preview.
  const envelope = record.response as { result?: unknown; error?: unknown }
  const toolResult =
    envelope.result !== null && typeof envelope.result === 'object'
      ? (envelope.result as ToolCallResult)
      : undefined

  return (
    <div className="flex flex-col gap-3">
      {statusLine}

      <div className="flex items-center gap-1 border-b border-border">
        {RESULT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            className={`px-2.5 py-1.5 text-xs transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'preview' ? (
        toolResult ? (
          <ResultPreview result={toolResult} />
        ) : (
          // JSON-RPC error envelope — no tool result; show the protocol error.
          <pre className="font-mono text-xs leading-relaxed border border-red-500/40 bg-red-500/5 text-red-500 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap break-words">
            {JSON.stringify(envelope.error ?? record.response, null, 2)}
          </pre>
        )
      ) : (
        <div className="relative">
          <CopyButton text={tab === 'raw' ? compact : pretty} />
          <pre className="font-mono text-xs leading-relaxed border border-border rounded bg-bg-elevated p-3 pr-16 overflow-auto max-h-96 whitespace-pre-wrap break-words text-text-primary">
            {tab === 'raw' ? compact : highlightJson(pretty)}
          </pre>
        </div>
      )}
    </div>
  )
}
