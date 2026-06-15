import { ChevronRight, ChevronDown } from 'lucide-react'

interface CategoryRowProps {
  icon: React.ReactNode
  label: string
  count: number
  expanded: boolean
  disabled?: boolean
  onToggle: () => void
}

// A capability group header (Tools / Resources / Prompts) — a mono uppercase
// subheader with a pill count, distinct from the server rows above it.
export function CategoryRow({
  icon,
  label,
  count,
  expanded,
  disabled = false,
  onToggle
}: CategoryRowProps): React.JSX.Element {
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={`mx-1 mt-2.5 mb-[3px] flex w-full items-center gap-[7px] rounded-[4px] px-1.5 py-[3px]
        font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors ${
          disabled
            ? 'cursor-default text-fg-faint opacity-50'
            : 'cursor-pointer text-fg-faint hover:text-text-muted'
        }`}
    >
      <Chevron size={10} className={`shrink-0 ${disabled ? 'opacity-0' : ''}`} />
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <span className="rounded-full border border-border-soft bg-bg-elevated px-[7px] py-px text-[10px]">
        {count}
      </span>
    </button>
  )
}
