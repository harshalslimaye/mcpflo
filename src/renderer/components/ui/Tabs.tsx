export interface TabItem<T extends string> {
  key: T
  label: string
  // Renders a parenthesised badge after the label when > 0.
  count?: number
  // Renders a small accent dot after the label with this as its aria-label,
  // e.g. "Has a saved test script" — for a boolean indicator, not a count.
  dotLabel?: string
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[]
  activeTab: T
  onTabChange: (tab: T) => void
  className?: string
  // Square off the active pill's bottom corners instead of rounding all four.
  // Only matters when the tab row sits with no padding directly above a
  // border (e.g. ServerDetailView's tab bar) — there, a fully-rounded pill
  // lets that border line show through under its rounded bottom corners.
  // ResultPanel/ToolRequestPanel's tabs sit inside a padded header well above
  // their own border, so they keep every corner rounded.
  flushBottom?: boolean
}

// Shared tab-bar: the active tab gets the accent-soft pill, inactive tabs stay
// muted until hovered. Used by the Response panel and the tool Request panel —
// kept as the single implementation of this pattern so a third tab bar doesn't
// reinvent it.
export function Tabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  className = 'flex gap-0.5',
  flushBottom = false
}: TabsProps<T>): React.JSX.Element {
  return (
    <div className={className}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-[11px] py-[5px] text-[12.5px] transition-colors ${
            flushBottom ? 'rounded-t-[6px]' : 'rounded-[6px]'
          } ${
            activeTab === tab.key
              ? 'bg-accent-soft text-accent'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <>
              {' '}
              <span
                className={`text-[11px] ${activeTab === tab.key ? 'text-accent' : 'text-fg-faint'}`}
              >
                ({tab.count})
              </span>
            </>
          )}
          {tab.dotLabel && (
            <span aria-label={tab.dotLabel} className="h-1.5 w-1.5 rounded-full bg-accent" />
          )}
        </button>
      ))}
    </div>
  )
}
