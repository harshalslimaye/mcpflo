import { Server } from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'
import { ToolDetailView } from '../tool/ToolDetailView'

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex-1 h-full bg-bg-primary overflow-y-auto flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Server size={48} className="text-text-muted" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-text-primary text-sm font-medium">Select an MCP Server</span>
          <span className="text-text-muted text-sm">or tool to get started</span>
        </div>
      </div>
    </div>
  )
}

export function ContentArea(): React.JSX.Element {
  const selectedTool = useServerStore((s) => s.selectedTool)
  const servers = useServerStore((s) => s.servers)

  const server = selectedTool ? servers.find((s) => s.id === selectedTool.serverId) : undefined
  const tool = server?.tools.find((t) => t.name === selectedTool?.toolName)

  if (!server || !tool) {
    return <EmptyState />
  }

  // Remount per tool so all local view state (active tab, form values) resets.
  return (
    <ToolDetailView
      key={`${server.id}::${tool.name}`}
      tool={tool}
      serverId={server.id}
      serverName={server.name}
    />
  )
}
