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
  // Active and default share the same content offset (border + padding = 11px) so
  // selecting a row doesn't shift its text: 1px border + pl-2.5 ↔ 2px border + pl-[9px].
  const stateClass = selected
    ? 'bg-accent-soft border-l-2 border-accent text-accent pl-[9px]'
    : `border-l border-border-soft pl-2.5 text-text-muted hover:bg-card-2 hover:text-text-primary ${
        interactive ? 'cursor-pointer' : 'cursor-default'
      }`

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={`ml-1.5 flex w-full items-start gap-2 rounded-r-[5px] py-[5px] pr-2 text-left transition-colors ${stateClass}`}
    >
      <span className={`mt-px shrink-0 ${selected ? 'text-accent' : 'text-fg-faint'}`}>{icon}</span>
      <span className="font-mono text-[12px] leading-[1.3] break-words">{label}</span>
    </button>
  )
}
