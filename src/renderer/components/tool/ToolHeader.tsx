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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-text-primary text-lg font-medium font-mono truncate">{tool.name}</h1>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-border text-text-muted shrink-0">
          <Server size={11} />
          {serverName}
        </span>
      </div>

      {tool.description && (
        <p className="text-text-muted text-sm leading-relaxed">{tool.description}</p>
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
