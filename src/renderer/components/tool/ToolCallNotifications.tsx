import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ToolCallNotification } from '../../../shared/mcp.types'
import { presentNotification } from '../../lib/notificationPresenters'
import { highlightJson } from '../shared/json/highlightJson'
import { CopyButton } from '../shared/json/CopyButton'

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour12: false })
}

function Badge({ label, className }: { label: string; className: string }): React.JSX.Element {
  return (
    <span
      className={`px-1 rounded text-[10px] font-medium uppercase tracking-wider border border-border bg-bg-primary shrink-0 ${className}`}
    >
      {label}
    </span>
  )
}

// One notification as an expansion panel: collapsed shows time + badge +
// one-line summary; expanded shows the read-only frame detail (method,
// received-at, pretty-printed params) with a copy button.
function NotificationPanel({
  notification
}: {
  notification: ToolCallNotification
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { badge, badgeClass, summary } = presentNotification(notification)
  const detail = JSON.stringify(
    { method: notification.method, params: notification.params ?? {} },
    null,
    2
  )

  return (
    <div className="border border-border rounded bg-bg-elevated">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left font-mono text-xs hover:bg-bg-primary/40 transition-colors"
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-text-muted opacity-70 shrink-0">{formatTime(notification.at)}</span>
        <Badge label={badge} className={badgeClass} />
        <span className="text-text-primary truncate">{summary}</span>
      </button>
      {open && (
        <div className="relative border-t border-border p-2">
          <CopyButton text={detail} />
          <pre className="font-mono text-xs leading-relaxed pr-16 overflow-auto max-h-60 whitespace-pre-wrap break-words text-text-primary">
            {highlightJson(detail)}
          </pre>
          <div className="mt-1 text-[10px] text-text-muted">
            received {formatTime(notification.at)}
          </div>
        </div>
      )}
    </div>
  )
}

// Content of the always-visible "Notifications" result tab: an expansion panel
// per notification, or a teaching empty state when the call produced none.
// `live` switches the empty-state tense for a call that is still running.
export function NotificationsTab({
  notifications,
  live = false
}: {
  notifications: ToolCallNotification[]
  live?: boolean
}): React.JSX.Element {
  if (notifications.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        {live
          ? 'No notifications received yet. Tools may emit progress updates, log messages, or resource updates while they run.'
          : 'No notifications were received during this call. Tools may emit progress updates, log messages, or resource updates while they run.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {notifications.map((notification, i) => (
        <NotificationPanel key={i} notification={notification} />
      ))}
    </div>
  )
}
