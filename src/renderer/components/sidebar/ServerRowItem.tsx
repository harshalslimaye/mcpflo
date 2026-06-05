import { ChevronRight, ChevronDown, RotateCw, Trash2 } from 'lucide-react'
import type { ServerStatus } from '../../../shared/mcp.types'

interface ServerRowItemProps {
  icon: React.ReactNode
  label: string
  count?: number
  depth: 0 | 1
  expanded: boolean
  disabled?: boolean
  status?: ServerStatus
  onToggle: () => void
  onRefresh?: () => void
  onDelete?: () => void
}

const STATUS_DOT: Record<ServerStatus, string> = {
  connected: 'bg-green-500',
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
  onToggle,
  onRefresh,
  onDelete
}: ServerRowItemProps): React.JSX.Element {
  const Chevron = expanded ? ChevronDown : ChevronRight
  const indent = depth === 0 ? 'pl-2' : 'pl-6'
  const fetching = status === 'connecting'

  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={`group w-full flex items-center gap-1.5 py-1 pr-2 text-left transition-colors
        ${indent}
        ${
          disabled
            ? 'cursor-default text-text-muted opacity-50'
            : 'text-text-primary hover:bg-bg-elevated cursor-pointer'
        }
      `}
    >
      <Chevron
        size={12}
        className={`shrink-0 transition-transform ${disabled ? 'opacity-0' : 'text-text-muted'}`}
      />
      <span className={`shrink-0 ${depth === 0 ? 'text-text-primary' : 'text-text-muted'}`}>
        {icon}
      </span>
      <span className={`flex-1 truncate text-xs ${depth === 0 ? 'font-medium' : ''}`}>{label}</span>

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

      {status && (
        <span
          title={status}
          className={`shrink-0 w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`}
        />
      )}
      {count !== undefined && <span className="text-xs text-text-muted">{count}</span>}
    </button>
  )
}
