import { AlertCircle, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react'

// 24×24 icon button, same visual language as the array-item toolbar buttons.
const DOCK_BTN =
  'inline-flex h-6 w-6 items-center justify-center rounded-[6px] border border-border bg-bg-elevated text-text-muted transition-colors hover:text-text-primary'

// The minimal result metadata the panel chrome needs to render its status chip.
// Absent ⇒ the call is in flight and the panel shows its busy state instead.
export interface ResultMeta {
  status: 'success' | 'error'
  durationMs: number
}

// Dock chrome shared by every result view. Forwarded into the panel header when
// the view is rendered inside a ResultDock; all-absent ⇒ a plain in-scroll panel.
export interface DockChrome {
  // Docked mode: the panel fills the result dock instead of taking its natural
  // height in the form scroll. Drops the standalone size caps, guards the header
  // against overflowing the column, and surfaces the collapse/maximize buttons.
  docked?: boolean
  collapsed?: boolean
  full?: boolean
  onToggleCollapse?: () => void
  onToggleMax?: () => void
}

interface ResultPanelProps<T extends string> extends DockChrome {
  // Shown in the busy state, e.g. "Executing…" / "Reading…".
  busyLabel: string
  // The completed call's status/duration. Absent ⇒ no completed result yet.
  record?: ResultMeta
  // A call is in flight: the header shows the busy spinner + `busyLabel`.
  // `busy` false with no `record` is the idle state (nothing run yet).
  busy?: boolean
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
  busy = false,
  tabs,
  activeTab,
  onTabChange,
  children,
  docked = false,
  collapsed = false,
  full = false,
  onToggleCollapse,
  onToggleMax
}: ResultPanelProps<T>): React.JSX.Element {
  const isError = record?.status === 'error'

  return (
    <section
      className={`flex flex-col overflow-hidden bg-bg-surface ${
        docked
          ? 'min-h-0 flex-1'
          : 'min-h-[140px] max-h-[60vh] shrink-0 rounded-[10px] border border-border'
      }`}
    >
      {/* header: RESPONSE · status · duration · tabs. Docked, the panel is a
          full-bleed band, so it gets the same px-7 inset as the form column
          above (vs. the tighter px-4 of the inline card). */}
      <div
        className={`flex items-center gap-4 border-b border-border bg-panel-2 py-[11px] ${
          docked ? 'min-w-0 overflow-hidden px-7' : 'px-4'
        }`}
      >
        {onToggleCollapse && (
          <button
            type="button"
            className={DOCK_BTN}
            aria-label={collapsed ? 'Expand response' : 'Collapse response'}
            onClick={onToggleCollapse}
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
          Response
        </span>

        {busy ? (
          <span className="inline-flex items-center gap-[7px] text-[12.5px] text-text-muted">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-accent" />
            {busyLabel}
          </span>
        ) : record ? (
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
          <span className="inline-flex items-center gap-[7px] text-[12.5px] text-fg-faint">
            <span className="h-[7px] w-[7px] rounded-full bg-border" />
            Idle
          </span>
        )}

        <div className="flex-1" />

        <div
          className={`flex gap-0.5 ${docked ? 'no-scrollbar min-w-0 shrink overflow-x-auto' : ''}`}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={`shrink-0 whitespace-nowrap rounded-[6px] px-[11px] py-[5px] text-[12.5px] transition-colors ${
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

        {onToggleMax && (
          <button
            type="button"
            className={`${DOCK_BTN} shrink-0`}
            aria-label={full ? 'Restore response' : 'Maximize response'}
            onClick={onToggleMax}
          >
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
      </div>

      {/* body — hidden when the dock is collapsed to its slim status bar.
          Docked content aligns to the form column's px-7 with comfortable
          vertical padding; the inline card stays tight. */}
      {!collapsed && (
        <div className={`min-h-0 flex-1 overflow-y-auto ${docked ? 'px-7 py-5' : 'p-4'}`}>
          {children}
        </div>
      )}
    </section>
  )
}
