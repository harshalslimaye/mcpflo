import { History as HistoryIcon } from 'lucide-react'

// The minimal shape History needs: every entry shows when it happened, how long
// it took and whether it succeeded. Both ToolCallRecord and ResourceReadRecord
// satisfy this, so the rail is generic over the record type.
export interface HistoryRecord {
  id: string
  at: number
  durationMs: number
  status: 'success' | 'error'
}

interface HistoryProps<T extends HistoryRecord> {
  records?: T[]
  // Shown when there are no records, e.g. "No calls yet." / "No reads yet."
  emptyLabel: string
  // Optional second line under the timestamp row, e.g. a tool call's arguments.
  renderDetail?: (record: T) => React.ReactNode
  // When provided, each entry becomes a clickable button calling this with the
  // record (used to pre-fill a request form with a past call's arguments and to
  // drive the Response panel).
  onSelectRecord?: (record: T) => void
  // The id of the record currently shown in the Response panel, highlighted so
  // it's clear which entry the panel reflects (the latest by default).
  selectedId?: string
}

export function History<T extends HistoryRecord>({
  records = [],
  emptyLabel,
  renderDetail,
  onSelectRecord,
  selectedId
}: HistoryProps<T>): React.JSX.Element {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full py-16 text-center">
        <HistoryIcon size={32} className="text-text-muted" />
        <span className="text-text-muted text-sm">{emptyLabel}</span>
      </div>
    )
  }

  const cardClass = 'rounded-[8px] border border-transparent px-[11px] py-[9px]'

  return (
    <ul className="flex flex-col gap-1 px-1 pb-4">
      {records.map((record) => {
        const isError = record.status === 'error'
        const isSelected = record.id === selectedId
        const detail = renderDetail?.(record)
        const content = (
          <>
            {/* Only space the row from a detail line when one is actually present. */}
            <div className={`flex items-center gap-2${detail ? ' mb-[5px]' : ''}`}>
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
            {detail}
          </>
        )

        return (
          <li key={record.id}>
            {onSelectRecord ? (
              <button
                type="button"
                aria-current={isSelected || undefined}
                onClick={() => onSelectRecord(record)}
                className={`${cardClass} w-full cursor-pointer text-left transition-colors hover:border-border-soft hover:bg-card-2 ${
                  isSelected ? 'border-border-soft bg-card-2' : ''
                }`}
              >
                {content}
              </button>
            ) : (
              <div className={`${cardClass} ${isSelected ? 'border-border-soft bg-card-2' : ''}`}>
                {content}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
