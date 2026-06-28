import {
  ChevronRight,
  ChevronDown,
  RotateCw,
  Trash2,
  Unplug,
  LogOut,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import type { ServerStatus, ServerAuthState } from '../../../shared/mcp.types'

interface ServerRowItemProps {
  icon: React.ReactNode
  label: string
  count?: number
  depth: 0 | 1
  expanded: boolean
  disabled?: boolean
  status?: ServerStatus
  // OAuth sign-in state — present only for OAuth servers. Additive to `status`:
  // it drives a separate sign-in/out affordance and never affects the dot color.
  auth?: ServerAuthState
  // True when the server's stored credentials couldn't be decrypted on this
  // machine — shows a warning badge prompting the user to re-enter them.
  credentialsUnavailable?: boolean
  // True when this server is the active selection (its details show in the
  // content area) — drives the accent highlight on the row body.
  selected?: boolean
  // Expands/collapses the tree under this row. Lives on its own chevron
  // button, separate from selecting the row (see onSelect).
  onToggle: () => void
  // Selects this server so its details show in the content area. Falls back
  // to onToggle when omitted, so callers that don't care about a separate
  // server-details view (e.g. tests) keep the old click-anywhere-to-toggle
  // behavior on the row body.
  onSelect?: () => void
  onDisconnect?: () => void
  onRefresh?: () => void
  onDelete?: () => void
  onClearAuth?: () => void
}

const STATUS_DOT: Record<ServerStatus, string> = {
  connected: 'bg-green shadow-[0_0_0_3px_var(--green-soft)]',
  connecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-zinc-500',
  error: 'bg-red-500'
}

export function ServerRowItem({
  icon,
  label,
  count,
  depth,
  expanded,
  disabled = false,
  status,
  auth,
  credentialsUnavailable = false,
  selected = false,
  onToggle,
  onSelect,
  onDisconnect,
  onRefresh,
  onDelete,
  onClearAuth
}: ServerRowItemProps): React.JSX.Element {
  const Chevron = expanded ? ChevronDown : ChevronRight
  const indent = depth === 0 ? 'pl-2' : 'pl-6'
  const fetching = status === 'connecting'

  return (
    <div
      role="group"
      aria-label={label}
      className={`group w-full flex items-center gap-1.5 py-1 pr-2 transition-colors rounded-[5px]
        ${indent}
        ${disabled ? 'opacity-50' : selected ? 'bg-accent-soft' : 'hover:bg-bg-elevated'}
      `}
    >
      <button
        type="button"
        aria-label={expanded ? 'Collapse' : 'Expand'}
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        className={`shrink-0 flex items-center justify-center ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <Chevron
          size={12}
          className={`transition-transform ${disabled ? 'opacity-0' : 'text-text-muted'}`}
        />
      </button>

      <button
        type="button"
        onClick={disabled ? undefined : (onSelect ?? onToggle)}
        disabled={disabled}
        className={`flex items-center gap-1.5 flex-1 min-w-0 text-left
          ${
            disabled
              ? 'cursor-default text-text-muted'
              : selected
                ? 'text-accent cursor-pointer'
                : 'text-text-primary cursor-pointer'
          }
        `}
      >
        <span
          className={`shrink-0 ${selected ? 'text-accent' : depth === 0 ? 'text-text-primary' : 'text-text-muted'}`}
        >
          {icon}
        </span>
        <span
          className={`flex-1 truncate ${depth === 0 ? 'text-[13.5px] font-semibold' : 'text-xs'}`}
        >
          {label}
        </span>
      </button>

      {credentialsUnavailable && (
        <span
          aria-label="Credentials unavailable"
          title="Stored credentials couldn't be decrypted on this device (e.g. config copied from another machine). Re-enter them to use this server."
          className="shrink-0 text-amber-500"
        >
          <AlertTriangle size={11} />
        </span>
      )}

      {onDisconnect && status === 'connected' && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Disconnect server"
          title="Disconnect server"
          onClick={(e) => {
            e.stopPropagation()
            onDisconnect()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onDisconnect()
            }
          }}
          className="shrink-0 text-text-muted hover:text-text-primary transition-opacity opacity-0 group-hover:opacity-100"
        >
          <Unplug size={11} />
        </span>
      )}

      {onRefresh && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Refresh capabilities"
          title="Refresh capabilities"
          onClick={(e) => {
            e.stopPropagation()
            onRefresh()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onRefresh()
            }
          }}
          className={`shrink-0 text-text-muted hover:text-text-primary transition-opacity
            ${fetching ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <RotateCw size={11} className={fetching ? 'animate-spin' : ''} />
        </span>
      )}

      {onDelete && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Delete server"
          title="Delete server"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }
          }}
          className="shrink-0 text-text-muted hover:text-red-400 transition-opacity opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={11} />
        </span>
      )}

      {/* OAuth: a spinner while sign-in runs (triggered implicitly by expanding
          the server), and a hover-only sign-out once authenticated. Additive to
          the status dot. */}
      {auth?.status === 'authenticating' && (
        <span
          aria-label="Signing in"
          title="Signing in…"
          className="shrink-0 flex items-center gap-1 text-[11px] text-text-muted"
        >
          <Loader2 size={11} className="animate-spin" />
          Signing in…
        </span>
      )}

      {auth?.status === 'authenticated' && onClearAuth && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Sign out"
          title="Sign out"
          onClick={(e) => {
            e.stopPropagation()
            onClearAuth()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onClearAuth()
            }
          }}
          className="shrink-0 text-text-muted hover:text-text-primary transition-opacity opacity-0 group-hover:opacity-100"
        >
          <LogOut size={11} />
        </span>
      )}

      {status && (
        <span
          title={status}
          className={`shrink-0 w-[7px] h-[7px] rounded-full ${STATUS_DOT[status]}`}
        />
      )}
      {count !== undefined && <span className="text-xs text-text-muted">{count}</span>}
    </div>
  )
}
