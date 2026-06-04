interface CapabilityItemProps {
  icon: React.ReactNode
  label: string
}

export function CapabilityItem({ icon, label }: CapabilityItemProps): React.JSX.Element {
  return (
    <div className="w-full flex items-center gap-1.5 pl-12 pr-2 py-0.5 text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-default">
      <span className="shrink-0">{icon}</span>
      <span className="truncate text-xs">{label}</span>
    </div>
  )
}
