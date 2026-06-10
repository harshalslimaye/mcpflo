import type { ToolCallRecord } from '../../stores/serverStore'
import type { ToolCallResult } from '../../../shared/mcp.types'

// Prefer plain text content when the result is text-only; otherwise show the
// full result object (covers images, embedded resources, structured content).
function resultBody(result: ToolCallResult | undefined): string {
  if (!result) return ''
  const content = result.content ?? []
  const textOnly = content.length > 0 && content.every((c) => typeof c.text === 'string')
  if (textOnly && result.structuredContent === undefined) {
    return content.map((c) => c.text).join('\n')
  }
  return JSON.stringify(result, null, 2)
}

interface ToolCallResultViewProps {
  record: ToolCallRecord
}

export function ToolCallResultView({ record }: ToolCallResultViewProps): React.JSX.Element {
  const isError = record.status === 'error'
  const body = record.error ?? resultBody(record.result)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`} />
        <span className={isError ? 'text-red-500' : 'text-text-primary'}>
          {isError ? 'Error' : 'Success'}
        </span>
        <span className="text-text-muted">{record.durationMs} ms</span>
      </div>
      <pre
        className={`font-mono text-xs leading-relaxed border rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap break-words ${
          isError
            ? 'border-red-500/40 bg-red-500/5 text-red-500'
            : 'border-border bg-bg-elevated text-text-primary'
        }`}
      >
        {body}
      </pre>
    </div>
  )
}
