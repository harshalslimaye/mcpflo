import { History } from 'lucide-react'
import type { ToolCallRecord } from '../../stores/serverStore'

interface HistoryTabProps {
  records?: ToolCallRecord[]
  // When provided, each entry becomes clickable and calls this with the clicked
  // record (used to pre-fill the Params form with that call's arguments).
  onSelectRecord?: (record: ToolCallRecord) => void
}

function summarizeArgs(args: Record<string, unknown>): string {
  const json = JSON.stringify(args)
  return json === '{}' ? 'no arguments' : json
}

export function HistoryTab({ records = [], onSelectRecord }: HistoryTabProps): React.JSX.Element {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full py-16 text-center">
        <History size={32} className="text-text-muted" />
        <span className="text-text-muted text-sm">No calls yet.</span>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-1 px-1 pb-4">
      {records.map((record) => {
        const isError = record.status === 'error'
        const content = (
          <>
            <div className="mb-[5px] flex items-center gap-2">
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
            <span
              className="block truncate font-mono text-[11px] text-code opacity-85"
              title={summarizeArgs(record.args)}
            >
              {summarizeArgs(record.args)}
            </span>
          </>
        )

        const cardClass = 'rounded-[8px] border border-transparent px-[11px] py-[9px]'

        return (
          <li key={record.id}>
            {onSelectRecord ? (
              <button
                type="button"
                onClick={() => onSelectRecord(record)}
                className={`${cardClass} w-full cursor-pointer text-left transition-colors hover:border-border-soft hover:bg-card-2`}
              >
                {content}
              </button>
            ) : (
              <div className={cardClass}>{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
