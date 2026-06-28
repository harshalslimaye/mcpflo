import { useEffect, useState } from 'react'
import { Globe, TerminalSquare, Clock } from 'lucide-react'
import type { MCPServer, ServerStatus, TransportConfig } from '../../../shared/mcp.types'

interface ServerHeaderProps {
  server: MCPServer
}

// Status pill text + colors. The dot mirrors the sidebar row's STATUS_DOT, with
// a matching label and text color so the pill reads at a glance.
const STATUS_META: Record<ServerStatus, { label: string; dot: string; text: string }> = {
  connected: { label: 'Connected', dot: 'bg-green', text: 'text-green' },
  connecting: { label: 'Connecting', dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-500' },
  disconnected: { label: 'Disconnected', dot: 'bg-zinc-500', text: 'text-text-muted' },
  error: { label: 'Error', dot: 'bg-red-500', text: 'text-red-500' }
}

// The transport row's icon, short label, and target (command for stdio, URL for
// streamable-http). Kept compact — the full detail lives in the edit modal.
function transportMeta(transport: TransportConfig): {
  icon: React.ReactNode
  label: string
  target: string
} {
  if (transport.type === 'stdio') {
    const target = [transport.command, ...(transport.args ?? [])].join(' ')
    return { icon: <TerminalSquare size={13} />, label: 'stdio', target }
  }
  return { icon: <Globe size={13} />, label: 'http', target: transport.url }
}

// Renders fetchedAt as a coarse "… ago" string. Undefined means never fetched.
function formatFetchedAt(fetchedAt: number | undefined, now: number): string | null {
  if (fetchedAt === undefined) return null
  const seconds = Math.max(0, Math.floor((now - fetchedAt) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function ServerHeader({ server }: ServerHeaderProps): React.JSX.Element {
  // `now` is captured in state (not read during render) and ticked every 30s so
  // the "… ago" label stays roughly current while the panel sits open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const status = STATUS_META[server.status]
  const transport = transportMeta(server.transport)
  const fetched = formatFetchedAt(server.fetchedAt, now)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-mono text-[23px] font-semibold tracking-[-0.01em] text-text-primary">
          {server.name}
        </h1>
        <span
          className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${status.text}`}
        >
          <span className={`h-[7px] w-[7px] rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[12.5px] text-text-muted">
        <span className="shrink-0 text-fg-faint">{transport.icon}</span>
        <span className="rounded-[5px] border border-border bg-bg-elevated px-1.5 py-px text-[11px] uppercase tracking-wide">
          {transport.label}
        </span>
        <span className="text-fg-faint">·</span>
        <span className="truncate font-mono text-[12px]">{transport.target}</span>
      </div>

      {server.status === 'error' && server.error ? (
        <p className="text-[12.5px] text-red-500 max-w-[72ch]">{server.error}</p>
      ) : (
        fetched && (
          <div className="flex items-center gap-1.5 text-[12px] text-fg-faint">
            <Clock size={12} />
            Capabilities fetched {fetched}
          </div>
        )
      )}
    </div>
  )
}
