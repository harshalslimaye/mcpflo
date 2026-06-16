import { Play } from 'lucide-react'

interface RequestPanelProps {
  // Right side of the header: tool's tabs + Raw-JSON toggle; resource passes none.
  headerEnd?: React.ReactNode
  // Footer-left hint, e.g. "Ready" / "Fill required fields" / "Reading…".
  statusHint: string
  // The single primary action of the panel (Execute / Read / …).
  run: {
    label: string
    busyLabel: string
    busy: boolean
    disabled: boolean
    onRun: () => void
  }
  // The panel body.
  children: React.ReactNode
}

// The Request panel chrome: a bordered panel with a REQUEST header (label +
// optional header-end controls), a body, and a footer carrying a status hint and
// the primary run button. ⌘/Ctrl+Enter triggers the run action.
export function RequestPanel({
  headerEnd,
  statusHint,
  run,
  children
}: RequestPanelProps): React.JSX.Element {
  function handleRun(): void {
    if (!run.disabled) run.onRun()
  }

  return (
    <section
      className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          handleRun()
        }
      }}
    >
      {/* header: REQUEST · header-end controls */}
      <div className="flex items-center gap-4 border-b border-border bg-panel-2 px-4 py-[11px]">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
          Request
        </span>
        {headerEnd}
      </div>

      {/* body */}
      <div className="px-4 py-[18px]">{children}</div>

      {/* footer: status hint · run */}
      <div className="flex items-center gap-3 border-t border-border-soft bg-bg-elevated px-4 py-[13px]">
        <span className="font-mono text-[11.5px] text-fg-faint">{statusHint}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleRun}
          disabled={run.disabled}
          className="inline-flex items-center gap-2 rounded-[8px] bg-[image:var(--btn)] px-[22px] py-[9px] text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={13} fill="currentColor" />
          {run.busy ? run.busyLabel : run.label}
        </button>
      </div>
    </section>
  )
}
