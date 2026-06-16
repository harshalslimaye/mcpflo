// A meta chip in the title row (the server name, a resource's mime type…). All
// share one bordered pill style — only the icon and label differ.
export interface MetaChip {
  icon: React.ReactNode
  label: string
}

// A colored annotation badge below the description (e.g. a tool's Read-only /
// Destructive hints). Unlike a MetaChip these carry their own color via className.
export interface Badge {
  label: string
  icon: React.ReactNode
  className: string
}

interface HeaderProps {
  title: string
  // Rendered in the title row, in order. Wrappers put the server chip first.
  chips?: MetaChip[]
  description?: string
  badges?: Badge[]
}

export function Header({
  title,
  chips = [],
  description,
  badges = []
}: HeaderProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-mono text-[23px] font-semibold tracking-[-0.01em] text-text-primary">
          {title}
        </h1>
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-border bg-bg-elevated px-2 py-[3px] text-[11.5px] text-text-muted"
          >
            {chip.icon}
            {chip.label}
          </span>
        ))}
      </div>

      {description && (
        <p className="text-text-muted text-[13.5px] leading-[1.55] max-w-[72ch]">{description}</p>
      )}

      {badges.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {badges.map((b) => (
            <span
              key={b.label}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${b.className}`}
            >
              {b.icon}
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
