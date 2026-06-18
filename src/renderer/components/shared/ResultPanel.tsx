import { AlertCircle } from 'lucide-react'

// The minimal result metadata the panel chrome needs to render its status chip.
// Absent ⇒ the call is in flight and the panel shows its busy state instead.
export interface ResultMeta {
  status: 'success' | 'error'
  durationMs: number
}

interface ResultPanelProps<T extends string> {
  // Shown in the busy state, e.g. "Executing…" / "Reading…".
  busyLabel: string
  // Absent while the call is in flight.
  record?: ResultMeta
  // `count`, when > 0, renders a parenthesised badge after the label.
  tabs: { key: T; label: string; count?: number }[]
  activeTab: T
  onTabChange: (tab: T) => void
  // The tab-resolved body, dropped into the scroll container.
  children: React.ReactNode
}

// The Response panel chrome: a bordered panel whose header carries the status
// chip, duration and tabs, and whose body scrolls the rendered output. The body
// itself is feature-specific and supplied as children.
//
// Sizing: the detail view scrolls the Request→Response stack as a page, so this
// panel takes its natural height (`shrink-0`) rather than fighting the Request
// panel for space. A `max-h` cap keeps a huge response from running the page on
// forever — past the cap the body scrolls internally instead.
export function ResultPanel<T extends string>({
  busyLabel,
  record,
  tabs,
  activeTab,
  onTabChange,
  children
}: ResultPanelProps<T>): React.JSX.Element {
  const isError = record?.status === 'error'

  return (
    <section className="flex min-h-[140px] max-h-[60vh] shrink-0 flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface">
      {/* header: RESPONSE · status · duration · tabs */}
      <div className="flex items-center gap-4 border-b border-border bg-panel-2 px-4 py-[11px]">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
          Response
        </span>

        {record ? (
          <>
            <span
              className={`inline-flex items-center gap-[7px] text-[12.5px] ${
                isError ? 'text-red-500' : 'text-green'
              }`}
            >
              <span
                className={`h-[7px] w-[7px] rounded-full ${
                  isError ? 'bg-red-500' : 'bg-green shadow-[0_0_0_3px_var(--green-soft)]'
                }`}
              />
              {isError && (
                <AlertCircle size={12} className="text-red-500" aria-label="Error icon" />
              )}
              {isError ? 'Error' : 'Success'}
            </span>
            <span className="rounded-[5px] border border-border-soft bg-bg-elevated px-[7px] py-0.5 font-mono text-[11px] text-text-muted">
              {record.durationMs} ms
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-[7px] text-[12.5px] text-text-muted">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-accent" />
            {busyLabel}
          </span>
        )}

        <div className="flex-1" />

        <div className="flex gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={`rounded-[6px] px-[11px] py-[5px] text-[12.5px] transition-colors ${
                activeTab === t.key
                  ? 'bg-accent-soft text-accent'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <>
                  {' '}
                  <span
                    className={`text-[11px] ${activeTab === t.key ? 'text-accent' : 'text-fg-faint'}`}
                  >
                    ({t.count})
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  )
}
