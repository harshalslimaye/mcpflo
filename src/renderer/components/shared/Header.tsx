import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

// Descriptions longer than this are collapsed behind a "Read more" toggle.
const DESCRIPTION_TRUNCATE_LENGTH = 240

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
  const [expanded, setExpanded] = useState(false)
  const isTruncatable = !!description && description.length > DESCRIPTION_TRUNCATE_LENGTH
  const shownDescription =
    isTruncatable && !expanded
      ? `${description!.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd()}…`
      : description

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
        <p className="text-text-muted text-[13.5px] leading-[1.55]">
          {shownDescription}
          {isTruncatable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-1.5 inline-flex items-center gap-0.5 align-baseline text-[12.5px] font-medium text-accent transition-colors hover:text-accent-hover"
            >
              {expanded ? 'Read less' : 'Read more'}
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </p>
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
