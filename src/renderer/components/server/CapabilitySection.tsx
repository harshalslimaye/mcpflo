import { ChevronDown, ChevronRight } from 'lucide-react'

// One expandable row's data — already resolved to its display label/description
// and token estimate, so this component stays capability-agnostic (no Tool /
// Resource / Prompt knowledge here; that mapping lives in CapabilitySections).
export interface CapabilityRowData {
  key: string
  icon: React.ReactNode
  label: string
  description?: string
  tokens: number
  onClick: () => void
}

interface CapabilitySectionProps {
  icon: React.ReactNode
  label: string
  count: number
  tokens: number
  expanded: boolean
  onToggle: () => void
  rows: CapabilityRowData[]
}

function formatTokens(tokens: number): string {
  return `~${Math.round(tokens).toLocaleString()}`
}

// One collapsible Tools/Resources/Prompts group in the server details view.
// A count of 0 disables the header (nothing to expand into) — mirrors the
// sidebar's CategoryRow so an empty category reads the same way in both places.
export function CapabilitySection({
  icon,
  label,
  count,
  tokens,
  expanded,
  onToggle,
  rows
}: CapabilitySectionProps): React.JSX.Element {
  const Chevron = expanded ? ChevronDown : ChevronRight
  const disabled = count === 0
  const showRows = expanded && !disabled

  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface">
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        aria-expanded={disabled ? undefined : expanded}
        className={`flex items-center gap-2 px-4 py-3 text-left transition-colors ${
          disabled ? 'cursor-default opacity-50' : 'cursor-pointer hover:bg-bg-elevated'
        }`}
      >
        <Chevron size={14} className={`shrink-0 text-text-muted ${disabled ? 'opacity-0' : ''}`} />
        <span className="shrink-0 text-text-muted">{icon}</span>
        <span className="font-mono text-[12.5px] font-semibold uppercase tracking-[0.08em] text-text-primary">
          {label}
        </span>
        <span className="rounded-full border border-border-soft bg-bg-elevated px-[7px] py-px text-[11px] text-fg-faint">
          {count}
        </span>
        <div className="flex-1" />
        <span className="text-[12.5px] text-text-muted">{formatTokens(tokens)}</span>
      </button>

      {showRows && (
        <div className="flex flex-col border-t border-border-soft">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={row.onClick}
              className="flex items-center gap-3 border-b border-border-soft px-4 py-[10px] text-left transition-colors last:border-b-0 hover:bg-bg-elevated"
            >
              <span className="shrink-0 text-fg-faint">{row.icon}</span>
              <span className="shrink-0 font-mono text-[12.5px] text-text-primary">
                {row.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-text-muted">
                {row.description}
              </span>
              <span className="shrink-0 text-[11.5px] text-fg-faint">
                {formatTokens(row.tokens)}
              </span>
              <ChevronRight size={13} className="shrink-0 text-fg-faint" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
