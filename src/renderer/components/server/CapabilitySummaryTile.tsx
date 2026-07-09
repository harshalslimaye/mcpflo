interface CapabilitySummaryTileProps {
  icon: React.ReactNode
  label: string
  count: number
  tokens: number
  onClick: () => void
}

function formatTokens(tokens: number): string {
  return `~${Math.round(tokens).toLocaleString()}`
}

// A compact jump-shortcut from Overview into the Capabilities tab, filtered to
// one category. Intentionally shows only count + token estimate — the
// detailed avg/percentage breakdown lives solely in ContextBudgetCard, and the
// full browsable list lives solely in the sidebar tree, so no two of the three
// surfaces duplicate each other's job.
export function CapabilitySummaryTile({
  icon,
  label,
  count,
  tokens,
  onClick
}: CapabilitySummaryTileProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className="flex items-center gap-3 rounded-[10px] border border-border bg-bg-surface px-4 py-3 text-left transition-colors hover:bg-bg-elevated disabled:cursor-default disabled:opacity-50 disabled:hover:bg-bg-surface"
    >
      <span className="shrink-0 text-fg-faint">{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-faint">
          {label}
        </span>
        <span className="text-[13.5px] text-text-primary">
          {count} <span className="text-text-muted">· {formatTokens(tokens)}</span>
        </span>
      </div>
    </button>
  )
}
