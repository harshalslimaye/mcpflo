import { useState } from 'react'
import { Server, Wrench, Database, MessageSquare, Zap, FileText, Hash } from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'
import { AddServerModal } from '../servers/AddServerModal'
import { ServerRowItem } from './ServerRowItem'
import { CapabilityItem } from './CapabilityItem'
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
  onToggleServer: () => void
  onToggleGroup: (group: GroupKey) => void
}

function ServerTree({
  server,
  expanded,
  expandedGroups,
  onToggleServer,
  onToggleGroup
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
                  const label = item.name ?? ('uri' in item ? item.uri : '')
                  return <CapabilityItem key={label} icon={meta.itemIcon} label={label} />
                })}
            </div>
          )
        })}
    </div>
  )
}

export function SecondarySidebar(): React.JSX.Element {
  const servers = useServerStore((s) => s.servers)
  const connectServer = useServerStore((s) => s.connectServer)
  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  function toggleServer(id: string): void {
    setExpandedServers((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    const server = servers.find((s) => s.id === id)
    if (server && server.status === 'disconnected') {
      connectServer(id)
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
              onToggleServer={() => toggleServer(server.id)}
              onToggleGroup={(group) => toggleGroup(server.id, group)}
            />
          ))}
        </div>
      </div>

      {showAddModal && <AddServerModal onClose={() => setShowAddModal(false)} />}
    </>
  )
}
