import { History } from 'lucide-react'
import type { ToolCallRecord } from '../../stores/serverStore'

interface HistoryTabProps {
  records?: ToolCallRecord[]
}

function summarizeArgs(args: Record<string, unknown>): string {
  const json = JSON.stringify(args)
  return json === '{}' ? 'no arguments' : json
}

export function HistoryTab({ records = [] }: HistoryTabProps): React.JSX.Element {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full py-16 text-center">
        <History size={32} className="text-text-muted" />
        <span className="text-text-muted text-sm">No calls yet.</span>
      </div>
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {records.map((record) => (
        <li key={record.id} className="flex flex-col gap-1 px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                record.status === 'error' ? 'bg-red-500' : 'bg-green-500'
              }`}
            />
            <span className="text-text-primary">{new Date(record.at).toLocaleTimeString()}</span>
            <span className="ml-auto text-text-muted">{record.durationMs} ms</span>
          </div>
          <span
            className="text-xs text-text-muted font-mono truncate"
            title={summarizeArgs(record.args)}
          >
            {summarizeArgs(record.args)}
          </span>
        </li>
      ))}
    </ul>
  )
}
