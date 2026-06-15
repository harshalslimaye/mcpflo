import { Server, ShieldCheck, AlertTriangle, Repeat } from 'lucide-react'
import type { Tool } from '../../../shared/mcp.types'

interface ToolHeaderProps {
  tool: Tool
  serverName: string
}

interface AnnotationBadge {
  label: string
  icon: React.ReactNode
  className: string
}

function annotationBadges(tool: Tool): AnnotationBadge[] {
  const a = tool.annotations
  if (!a) return []
  const badges: AnnotationBadge[] = []
  if (a.readOnlyHint === true) {
    badges.push({
      label: 'Read-only',
      icon: <ShieldCheck size={11} />,
      className: 'border-border text-text-muted'
    })
  }
  if (a.destructiveHint === true) {
    badges.push({
      label: 'Destructive',
      icon: <AlertTriangle size={11} />,
      className: 'border-red-500/40 text-red-500 bg-red-500/10'
    })
  }
  if (a.idempotentHint === true) {
    badges.push({
      label: 'Idempotent',
      icon: <Repeat size={11} />,
      className: 'border-border text-text-muted'
    })
  }
  return badges
}

export function ToolHeader({ tool, serverName }: ToolHeaderProps): React.JSX.Element {
  const badges = annotationBadges(tool)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-mono text-[23px] font-semibold tracking-[-0.01em] text-text-primary">
          {tool.name}
        </h1>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-border bg-bg-elevated px-2 py-[3px] text-[11.5px] text-text-muted">
          <Server size={12} />
          {serverName}
        </span>
      </div>

      {tool.description && (
        <p className="text-text-muted text-[13.5px] leading-[1.55] max-w-[72ch]">
          {tool.description}
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
