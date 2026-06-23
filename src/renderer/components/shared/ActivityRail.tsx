import { useState } from 'react'
import { History, type HistoryRecord } from './History'
import { HistoryRail } from './HistoryRail'
import { ActivityList } from './ActivityList'
import { useActivityLog } from './useActivityLog'

type Tab = 'all' | 'this'

interface ActivityRailProps<T extends HistoryRecord> {
  // The current entity's own records — the "This …" tab, unchanged from before.
  thisRecords: T[]
  // Label for the entity tab, e.g. "This tool" / "This resource" / "This prompt".
  thisTabLabel: string
  // Empty-state copy for the entity tab ("No calls yet." …).
  emptyLabel: string
  // Optional second line under an entity row (a call's argument summary).
  renderDetail?: (record: T) => React.ReactNode
  // The entity record currently shown in the Response panel, highlighted.
  selectedId?: string
  // Selecting an entity row (drives the Response panel / re-fills the form).
  onSelectThis?: (record: T) => void
  // Clears just this entity's history (the entity tab's "clear").
  onClearThis: () => void
}

// The right-hand history rail with two tabs: "All" (a unified, cross-server log
// of every connection, listing and call) and "This …" (the current entity's own
// history — the previous behaviour, untouched). Defaults to "All" so the global
// log is the first thing shown; tab state is local and resets per entity.
export function ActivityRail<T extends HistoryRecord>({
  thisRecords,
  thisTabLabel,
  emptyLabel,
  renderDetail,
  selectedId,
  onSelectThis,
  onClearThis
}: ActivityRailProps<T>): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('all')
  const { events: allEvents, navigateTo, clearAll } = useActivityLog()

  const count = tab === 'all' ? allEvents.length : thisRecords.length
  const onClear = tab === 'all' ? clearAll : onClearThis

  const tabs = (
    <div className="flex gap-1 rounded-[8px] border border-border-soft bg-bg-elevated p-[3px]">
      {(
        [
          ['all', 'All'],
          ['this', thisTabLabel]
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setTab(value)}
          className={`flex-1 rounded-[6px] px-2 py-[5px] text-[11px] font-medium transition-colors ${
            tab === value ? 'bg-card-2 text-text-primary' : 'text-fg-faint hover:text-text-primary'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <HistoryRail count={count} onClear={onClear} tabs={tabs}>
      {tab === 'all' ? (
        <ActivityList events={allEvents} emptyLabel="No activity yet." onSelect={navigateTo} />
      ) : (
        <History
          records={thisRecords}
          emptyLabel={emptyLabel}
          renderDetail={renderDetail}
          selectedId={selectedId}
          onSelectRecord={onSelectThis}
        />
      )}
    </HistoryRail>
  )
}
