import { History as HistoryIcon, Wrench, FileText, MessageSquare, Plug, List } from 'lucide-react'
import type { ActivityEvent, ActivityKind } from '../../lib/activityEvent'

// Icon per activity kind, so a glance distinguishes a tool call from a resource
// read, a handshake, or a capability listing.
const KIND_ICON: Record<ActivityKind, typeof Wrench> = {
  'tool-call': Wrench,
  'resource-read': FileText,
  'prompt-get': MessageSquare,
  connect: Plug,
  'list-tools': List,
  'list-resources': List,
  'list-prompts': List
}

// Protocol-row caption shown on the detail line, so a connect/list row names the
// method it represents. Call rows are identified by their icon + label instead.
const KIND_LABEL: Partial<Record<ActivityKind, string>> = {
  connect: 'initialize',
  'list-tools': 'tools/list',
  'list-resources': 'resources/list',
  'list-prompts': 'prompts/list'
}

interface ActivityListProps {
  events: ActivityEvent[]
  emptyLabel: string
  // Invoked with a call-type event (one carrying a `target`) when its row is
  // clicked — used to navigate to that tool/resource/prompt. Protocol rows have
  // no target and render as non-interactive.
  onSelect: (event: ActivityEvent) => void
}

// The "All" history tab body: a unified, newest-first list of every activity
// across all servers. Call rows are clickable (they navigate to their entity);
// protocol rows are read-only.
export function ActivityList({
  events,
  emptyLabel,
  onSelect
}: ActivityListProps): React.JSX.Element {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full py-16 text-center">
        <HistoryIcon size={32} className="text-text-muted" />
        <span className="text-text-muted text-sm">{emptyLabel}</span>
      </div>
    )
  }

  const cardClass = 'rounded-[8px] border border-transparent px-[11px] py-[9px]'

  return (
    <ul className="flex flex-col gap-1 px-1 pb-4">
      {events.map((event) => {
        const isError = event.status === 'error'
        const isCached = event.source === 'cache'
        const Icon = KIND_ICON[event.kind]
        const caption = KIND_LABEL[event.kind]
        const content = (
          <>
            <div className="flex items-center gap-2 mb-[5px]">
              <span
                className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                  isError ? 'bg-red-500' : 'bg-green shadow-[0_0_0_3px_var(--green-soft)]'
                }`}
              />
              <Icon size={12} className="shrink-0 text-fg-faint" />
              <span className="flex-1 truncate font-mono text-[11px] text-text-primary">
                {event.label}
              </span>
              {/* Cached rows replayed from disk have no meaningful duration, so
                  they show a "cached" badge where the timing would be. */}
              {isCached ? (
                <span className="shrink-0 rounded-full border border-border-soft bg-bg-elevated px-[6px] py-px font-mono text-[9.5px] uppercase tracking-[0.06em] text-fg-faint">
                  cached
                </span>
              ) : (
                <span className="shrink-0 font-mono text-[10.5px] text-fg-faint">
                  {event.durationMs} ms
                </span>
              )}
            </div>
            {/* Detail line: a protocol caption (e.g. tools/list) and/or the
                event's own summary (args / counts / error message). */}
            <span className="block truncate font-mono text-[11px] text-code opacity-85">
              {caption && <span className="text-fg-faint">{caption}</span>}
              {caption && event.detail ? ' · ' : ''}
              {event.detail}
            </span>
          </>
        )

        return (
          <li key={event.id}>
            {event.target ? (
              <button
                type="button"
                onClick={() => onSelect(event)}
                className={`${cardClass} w-full cursor-pointer text-left transition-colors hover:border-border-soft hover:bg-card-2`}
              >
                {content}
              </button>
            ) : (
              <div className={cardClass}>{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
