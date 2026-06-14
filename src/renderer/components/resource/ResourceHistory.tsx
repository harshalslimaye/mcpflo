import { History } from 'lucide-react'
import type { ResourceReadRecord } from '../../stores/serverStore'

interface ResourceHistoryProps {
  records?: ResourceReadRecord[]
}

export function ResourceHistory({ records = [] }: ResourceHistoryProps): React.JSX.Element {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full py-16 text-center">
        <History size={32} className="text-text-muted" />
        <span className="text-text-muted text-sm">No reads yet.</span>
      </div>
    )
  }

  // Every entry is the same resource (this rail is per-resource), so the row
  // shows only when and how the read went — not the uri.
  return (
    <ul className="flex flex-col divide-y divide-border">
      {records.map((record) => (
        <li key={record.id} className="flex items-center gap-2 px-3 py-2 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              record.status === 'error' ? 'bg-red-500' : 'bg-green-500'
            }`}
          />
          <span className="text-text-primary">{new Date(record.at).toLocaleTimeString()}</span>
          <span className="ml-auto text-text-muted">{record.durationMs} ms</span>
        </li>
      ))}
    </ul>
  )
}
