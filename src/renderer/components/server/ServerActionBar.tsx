import { Unplug, RotateCw, LogOut, Trash2, X } from 'lucide-react'
import type { MCPServer } from '../../../shared/mcp.types'

interface ServerActionBarProps {
  server: MCPServer
  onDisconnect: () => void
  onReload: () => void
  onCancel: () => void
  onSignOut: () => void
  onDelete: () => void
}

interface ActionButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  danger = false
}: ActionButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-[8px] px-[14px] py-[9px] text-[13px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? 'bg-red-600 hover:bg-red-500'
          : 'bg-[image:var(--btn)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[filter] hover:brightness-110'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

export function ServerActionBar({
  server,
  onDisconnect,
  onReload,
  onCancel,
  onSignOut,
  onDelete
}: ServerActionBarProps): React.JSX.Element {
  const fetching = server.status === 'connecting'
  // Sign out is OAuth-only and only meaningful once tokens are held — mirrors
  // the sidebar row's clear-auth affordance gating.
  const canSignOut = server.auth?.status === 'authenticated'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {server.status === 'connected' && (
        <ActionButton icon={<Unplug size={13} />} label="Disconnect" onClick={onDisconnect} />
      )}

      <ActionButton
        icon={<RotateCw size={13} className={fetching ? 'animate-spin' : ''} />}
        label="Reload capabilities"
        onClick={onReload}
        disabled={fetching}
      />

      {/* Only shown while a fetch is in flight, to cancel it. */}
      {fetching && <ActionButton icon={<X size={13} />} label="Cancel" onClick={onCancel} />}

      {canSignOut && (
        <ActionButton icon={<LogOut size={13} />} label="Sign out" onClick={onSignOut} />
      )}

      <div className="flex-1" />

      <ActionButton icon={<Trash2 size={13} />} label="Delete server" onClick={onDelete} danger />
    </div>
  )
}
