interface CapabilityItemProps {
  icon: React.ReactNode
  label: string
  selected?: boolean
  onClick?: () => void
}

export function CapabilityItem({
  icon,
  label,
  selected = false,
  onClick
}: CapabilityItemProps): React.JSX.Element {
  const interactive = onClick !== undefined
  const stateClass = selected
    ? 'text-accent bg-accent/10'
    : interactive
      ? 'text-text-muted hover:text-text-primary hover:bg-bg-elevated cursor-pointer'
      : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated cursor-default'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={`w-full flex items-center gap-1.5 pl-12 pr-2 py-0.5 text-left transition-colors ${stateClass}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate text-xs">{label}</span>
    </button>
  )
}
