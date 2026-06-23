interface HistoryRailProps {
  // Number of records; drives the count pill and gates the pill/clear controls.
  count: number
  onClear: () => void
  // Optional tab strip rendered below the header and above the scroll body, so
  // it stays fixed while the list scrolls.
  tabs?: React.ReactNode
  // The <History> element to scroll inside the rail.
  children: React.ReactNode
}

// The right-hand History rail: a bordered aside with a "History" header (count
// pill + clear when non-empty), an optional tab strip, and a scrollable body
// holding the History list.
export function HistoryRail({
  count,
  onClear,
  tabs,
  children
}: HistoryRailProps): React.JSX.Element {
  return (
    <aside className="w-[304px] shrink-0 flex flex-col min-h-0 border-l border-border pl-6 pr-7 pt-[22px] pb-6">
      <div className="flex items-center gap-2.5 px-1 pb-2.5 shrink-0">
        <h2 className="flex-1 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-faint">
          History
        </h2>
        {count > 0 && (
          <>
            <span className="rounded-full border border-border-soft bg-bg-elevated px-[7px] py-px font-mono text-[10px] text-fg-faint">
              {count}
            </span>
            <button
              type="button"
              onClick={onClear}
              className="font-mono text-[11px] text-fg-faint transition-colors hover:text-accent"
            >
              clear
            </button>
          </>
        )}
      </div>
      {tabs && <div className="shrink-0 pb-2.5">{tabs}</div>}
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </aside>
  )
}
