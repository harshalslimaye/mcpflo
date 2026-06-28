import { Server } from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'
import { ToolDetailView } from '../tool/ToolDetailView'
import { ResourceDetailView } from '../resource/ResourceDetailView'
import { PromptDetailView } from '../prompt/PromptDetailView'
import { ServerDetailView } from '../server/ServerDetailView'
import { GlobalActivityRail } from '../shared/GlobalActivityRail'

function EmptyState({ title, subtitle }: { title: string; subtitle: string }): React.JSX.Element {
  return (
    <div className="flex-1 h-full bg-bg-primary overflow-y-auto flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Server size={48} className="text-text-muted" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-text-primary text-sm font-medium">{title}</span>
          <span className="text-text-muted text-sm">{subtitle}</span>
        </div>
      </div>
    </div>
  )
}

export function ContentArea(): React.JSX.Element {
  const selectedServerId = useServerStore((s) => s.selectedServerId)
  const selectedTool = useServerStore((s) => s.selectedTool)
  const selectedResource = useServerStore((s) => s.selectedResource)
  const selectedPrompt = useServerStore((s) => s.selectedPrompt)
  const servers = useServerStore((s) => s.servers)

  // Selection is mutually exclusive, so at most one of these branches matches.
  // The order is immaterial.
  if (selectedPrompt) {
    const server = servers.find((s) => s.id === selectedPrompt.serverId)
    const prompt = server?.prompts.find((p) => p.name === selectedPrompt.promptName)
    if (server && prompt) {
      // Remount per prompt so all local view state (active tab, form values) resets.
      return (
        <PromptDetailView
          key={`${server.id}::${prompt.name}`}
          prompt={prompt}
          serverId={server.id}
          serverName={server.name}
        />
      )
    }
  }

  if (selectedResource) {
    const server = servers.find((s) => s.id === selectedResource.serverId)
    const resource = server?.resources.find((r) => r.uri === selectedResource.uri)
    if (server && resource) {
      // Remount per resource so local view state (result tab) resets.
      return (
        <ResourceDetailView
          key={`${server.id}::${resource.uri}`}
          resource={resource}
          serverId={server.id}
          serverName={server.name}
        />
      )
    }
  }

  if (selectedTool) {
    const server = servers.find((s) => s.id === selectedTool.serverId)
    const tool = server?.tools.find((t) => t.name === selectedTool.toolName)
    if (server && tool) {
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
  }

  if (selectedServerId) {
    const server = servers.find((s) => s.id === selectedServerId)
    if (server) {
      // Remount per server so local view state (the delete confirmation) resets.
      return <ServerDetailView key={server.id} server={server} />
    }
  }

  if (servers.length === 0) {
    return (
      <EmptyState
        title="No servers yet"
        subtitle="Add an MCP server from the sidebar to get started"
      />
    )
  }

  // Servers exist but nothing is selected: keep the global activity rail visible
  // on the right so the "All" history (incl. cached/connection events) is the
  // first thing seen, not hidden until a tool is opened.
  return (
    <div className="flex-1 h-full bg-bg-primary flex overflow-hidden">
      <EmptyState
        title="Ready when you are"
        subtitle="Choose a tool, resource, or prompt to get started"
      />
      <GlobalActivityRail />
    </div>
  )
}
