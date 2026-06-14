import { useState } from 'react'
import { Server, Wrench, Database, MessageSquare, Zap, FileText, Hash } from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'
import { AddServerModal } from '../servers/AddServerModal'
import { DeleteServerModal } from '../servers/DeleteServerModal'
import { ServerRowItem } from './ServerRowItem'
import { CapabilityItem } from './CapabilityItem'
import type { SelectedTool, SelectedResource } from '../../stores/serverStore'
import type { MCPServer, Tool, Resource, Prompt } from '../../../shared/mcp.types'

type GroupKey = 'tools' | 'resources' | 'prompts'

const GROUP_META: Record<
  GroupKey,
  { label: string; icon: React.ReactNode; itemIcon: React.ReactNode }
> = {
  tools: { label: 'Tools', icon: <Wrench size={13} />, itemIcon: <Zap size={11} /> },
  resources: { label: 'Resources', icon: <Database size={13} />, itemIcon: <FileText size={11} /> },
  prompts: { label: 'Prompts', icon: <MessageSquare size={13} />, itemIcon: <Hash size={11} /> }
}

function groupId(serverId: string, group: GroupKey): string {
  return `${serverId}-${group}`
}

interface ServerTreeProps {
  server: MCPServer
  expanded: boolean
  expandedGroups: Set<string>
  selectedTool: SelectedTool | null
  selectedResource: SelectedResource | null
  onToggleServer: () => void
  onToggleGroup: (group: GroupKey) => void
  onSelectTool: (toolName: string) => void
  onSelectResource: (uri: string) => void
  onRefresh: () => void
  onDelete: () => void
}

function ServerTree({
  server,
  expanded,
  expandedGroups,
  selectedTool,
  selectedResource,
  onToggleServer,
  onToggleGroup,
  onSelectTool,
  onSelectResource,
  onRefresh,
  onDelete
}: ServerTreeProps): React.JSX.Element {
  const groups: { key: GroupKey; items: (Tool | Resource | Prompt)[] }[] = [
    { key: 'tools', items: server.tools },
    { key: 'resources', items: server.resources },
    { key: 'prompts', items: server.prompts }
  ]

  return (
    <div className="border-t border-border">
      <ServerRowItem
        icon={<Server size={13} />}
        label={server.name}
        depth={0}
        expanded={expanded}
        status={server.status}
        onToggle={onToggleServer}
        onRefresh={onRefresh}
        onDelete={onDelete}
      />

      {expanded &&
        groups.map(({ key, items }) => {
          const meta = GROUP_META[key]
          const isGroupExpanded = expandedGroups.has(groupId(server.id, key))

          return (
            <div key={key}>
              <ServerRowItem
                icon={meta.icon}
                label={meta.label}
                count={items.length}
                depth={1}
                expanded={isGroupExpanded}
                disabled={items.length === 0}
                onToggle={() => onToggleGroup(key)}
              />

              {isGroupExpanded &&
                items.map((item) => {
                  const uri = 'uri' in item ? item.uri : undefined
                  const label = item.name ?? uri ?? ''
                  // Tools and resources open a detail view; prompts stay
                  // display-only until they get one.
                  const isTool = key === 'tools'
                  const isResource = key === 'resources'
                  const isSelected = isTool
                    ? selectedTool?.serverId === server.id && selectedTool?.toolName === label
                    : isResource
                      ? selectedResource?.serverId === server.id && selectedResource?.uri === uri
                      : false
                  const onClick = isTool
                    ? () => onSelectTool(label)
                    : isResource && uri !== undefined
                      ? () => onSelectResource(uri)
                      : undefined
                  return (
                    <CapabilityItem
                      key={uri ?? label}
                      icon={meta.itemIcon}
                      label={label}
                      selected={isSelected}
                      onClick={onClick}
                    />
                  )
                })}
            </div>
          )
        })}
    </div>
  )
}

export function SecondarySidebar(): React.JSX.Element {
  const servers = useServerStore((s) => s.servers)
  const fetchCapabilities = useServerStore((s) => s.fetchCapabilities)
  const refreshCapabilities = useServerStore((s) => s.refreshCapabilities)
  const selectedTool = useServerStore((s) => s.selectedTool)
  const selectTool = useServerStore((s) => s.selectTool)
  const selectedResource = useServerStore((s) => s.selectedResource)
  const selectResource = useServerStore((s) => s.selectResource)
  const [showAddModal, setShowAddModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MCPServer | null>(null)
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  function toggleServer(id: string): void {
    const willExpand = !expandedServers.has(id)
    setExpandedServers((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    // Lazy fetch: auto-fetch only a never-fetched server (grey) on expand.
    // Cached (green) and errored (red) servers refetch only via the refresh button.
    if (willExpand) {
      const server = servers.find((s) => s.id === id)
      if (server && server.status === 'disconnected') {
        fetchCapabilities(id)
      }
    }
  }

  function toggleGroup(serverId: string, group: GroupKey): void {
    const key = groupId(serverId, group)
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <>
      <div className="flex flex-col w-60 h-full bg-bg-primary border-r border-border shrink-0 overflow-y-auto">
        <div className="px-3 pt-4 pb-2">
          <span className="text-text-muted text-xs uppercase tracking-wider font-medium">
            MCP Servers
          </span>
        </div>

        <div className="px-3 pb-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="text-accent text-sm hover:text-accent-hover transition-colors"
          >
            + Add Server
          </button>
        </div>

        <div className="flex flex-col">
          {servers.map((server) => (
            <ServerTree
              key={server.id}
              server={server}
              expanded={expandedServers.has(server.id)}
              expandedGroups={expandedGroups}
              selectedTool={selectedTool}
              selectedResource={selectedResource}
              onToggleServer={() => toggleServer(server.id)}
              onToggleGroup={(group) => toggleGroup(server.id, group)}
              onSelectTool={(toolName) => selectTool(server.id, toolName)}
              onSelectResource={(uri) => selectResource(server.id, uri)}
              onRefresh={() => refreshCapabilities(server.id)}
              onDelete={() => setPendingDelete(server)}
            />
          ))}
        </div>
      </div>

      {showAddModal && <AddServerModal onClose={() => setShowAddModal(false)} />}

      {pendingDelete && (
        <DeleteServerModal
          serverId={pendingDelete.id}
          serverName={pendingDelete.name}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  )
}
