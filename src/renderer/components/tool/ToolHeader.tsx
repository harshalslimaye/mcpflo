import { Server, ShieldCheck, AlertTriangle, Repeat } from 'lucide-react'
import type { Tool } from '../../../shared/mcp.types'
import { Header, type Badge } from '../shared/Header'

interface ToolHeaderProps {
  tool: Tool
  serverName: string
}

function annotationBadges(tool: Tool): Badge[] {
  const a = tool.annotations
  if (!a) return []
  const badges: Badge[] = []
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
  return (
    <Header
      title={tool.name}
      chips={[{ icon: <Server size={12} />, label: serverName }]}
      description={tool.description}
      badges={annotationBadges(tool)}
    />
  )
}
