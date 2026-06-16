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
    <ul className="flex flex-col gap-1 px-1 pb-4">
      {records.map((record) => {
        const isError = record.status === 'error'
        return (
          <li
            key={record.id}
            className="rounded-[8px] border border-transparent px-[11px] py-[9px]"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                  isError ? 'bg-red-500' : 'bg-green shadow-[0_0_0_3px_var(--green-soft)]'
                }`}
              />
              <span className="flex-1 truncate font-mono text-[11px] text-text-primary">
                {new Date(record.at).toLocaleTimeString()}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] text-fg-faint">
                {record.durationMs} ms
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
