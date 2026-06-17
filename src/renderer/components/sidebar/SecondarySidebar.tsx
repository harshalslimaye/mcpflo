import { useEffect, useRef, useState } from 'react'
import {
  Server,
  Wrench,
  Database,
  MessageSquare,
  Zap,
  FileText,
  Hash,
  Plus,
  Search
} from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'
import { AddServerModal } from '../servers/AddServerModal'
import { DeleteServerModal } from '../servers/DeleteServerModal'
import { ServerRowItem } from './ServerRowItem'
import { CategoryRow } from './CategoryRow'
import { CapabilityItem } from './CapabilityItem'
import type { SelectedTool, SelectedResource, SelectedPrompt } from '../../stores/serverStore'
import type { MCPServer, Tool, Resource, Prompt } from '../../../shared/mcp.types'

type GroupKey = 'tools' | 'resources' | 'prompts'

const GROUP_META: Record<
  GroupKey,
  { label: string; icon: React.ReactNode; itemIcon: React.ReactNode }
> = {
  tools: { label: 'Tools', icon: <Wrench size={13} />, itemIcon: <Zap size={13} /> },
  resources: { label: 'Resources', icon: <Database size={13} />, itemIcon: <FileText size={13} /> },
  prompts: { label: 'Prompts', icon: <MessageSquare size={13} />, itemIcon: <Hash size={13} /> }
}

function groupId(serverId: string, group: GroupKey): string {
  return `${serverId}-${group}`
}

// Display label used both for rendering and for filter matching. Tools/prompts
// carry a name; resources fall back to their uri.
function itemLabel(item: Tool | Resource | Prompt): string {
  const uri = 'uri' in item ? item.uri : undefined
  return item.name ?? uri ?? ''
}

interface ServerTreeProps {
  server: MCPServer
  expanded: boolean
  expandedGroups: Set<string>
  // Normalized (trimmed, lowercased) filter query. Empty means no filtering.
  filter: string
  selectedTool: SelectedTool | null
  selectedResource: SelectedResource | null
  selectedPrompt: SelectedPrompt | null
  onToggleServer: () => void
  onToggleGroup: (group: GroupKey) => void
  onSelectTool: (toolName: string) => void
  onSelectResource: (uri: string) => void
  onSelectPrompt: (promptName: string) => void
  onRefresh: () => void
  onDelete: () => void
}

function ServerTree({
  server,
  expanded,
  expandedGroups,
  filter,
  selectedTool,
  selectedResource,
  selectedPrompt,
  onToggleServer,
  onToggleGroup,
  onSelectTool,
  onSelectResource,
  onSelectPrompt,
  onRefresh,
  onDelete
}: ServerTreeProps): React.JSX.Element | null {
  const filtering = filter.length > 0

  const baseGroups = [
    { key: 'tools', items: server.tools },
    { key: 'resources', items: server.resources },
    { key: 'prompts', items: server.prompts }
  ] satisfies { key: GroupKey; items: (Tool | Resource | Prompt)[] }[]

  const groups = baseGroups.map((g) => ({
    ...g,
    visible: filtering
      ? g.items.filter((i) => itemLabel(i).toLowerCase().includes(filter))
      : g.items
  }))

  // While filtering, drop whole servers that have no matching capabilities.
  if (filtering && groups.every((g) => g.visible.length === 0)) return null

  // Matching servers/groups display expanded regardless of the user's manual
  // expansion state; clearing the filter restores it (we never mutate the Sets).
  const serverExpanded = filtering || expanded

  return (
    <div>
      <ServerRowItem
        icon={<Server size={13} />}
        label={server.name}
        depth={0}
        expanded={serverExpanded}
        status={server.status}
        onToggle={onToggleServer}
        onRefresh={onRefresh}
        onDelete={onDelete}
      />

      {serverExpanded &&
        groups.map(({ key, items, visible }) => {
          // While filtering, only show groups that have matches.
          if (filtering && visible.length === 0) return null
          const meta = GROUP_META[key]
          const isGroupExpanded = filtering ? true : expandedGroups.has(groupId(server.id, key))

          return (
            <div key={key}>
              <CategoryRow
                icon={meta.icon}
                label={meta.label}
                count={items.length}
                expanded={isGroupExpanded}
                disabled={items.length === 0}
                onToggle={() => onToggleGroup(key)}
              />

              {isGroupExpanded &&
                visible.map((item) => {
                  const uri = 'uri' in item ? item.uri : undefined
                  const label = item.name ?? uri ?? ''
                  // Tools, resources and prompts each open a detail view.
                  const isTool = key === 'tools'
                  const isResource = key === 'resources'
                  const isPrompt = key === 'prompts'
                  const isSelected = isTool
                    ? selectedTool?.serverId === server.id && selectedTool?.toolName === label
                    : isResource
                      ? selectedResource?.serverId === server.id && selectedResource?.uri === uri
                      : isPrompt
                        ? selectedPrompt?.serverId === server.id &&
                          selectedPrompt?.promptName === label
                        : false
                  const onClick = isTool
                    ? () => onSelectTool(label)
                    : isResource && uri !== undefined
                      ? () => onSelectResource(uri)
                      : isPrompt
                        ? () => onSelectPrompt(label)
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
  const selectedPrompt = useServerStore((s) => s.selectedPrompt)
  const selectPrompt = useServerStore((s) => s.selectPrompt)
  const [showAddModal, setShowAddModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MCPServer | null>(null)
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const filterInputRef = useRef<HTMLInputElement>(null)
  // Normalized query handed to each tree; empty means no filtering.
  const query = filter.trim().toLowerCase()

  // ⌘K / Ctrl+K focuses the filter input from anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        filterInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      <div className="flex flex-col w-[268px] h-full bg-bg-surface border-r border-border shrink-0">
        <div className="px-4 pt-4 pb-2.5">
          <h2 className="text-[11px] font-bold tracking-[0.12em] uppercase text-fg-faint mb-3">
            MCP Servers
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-[7px] py-1 text-accent text-[13px] font-semibold hover:text-accent-hover transition-colors"
          >
            <Plus size={14} />
            Add Server
          </button>
        </div>

        <div className="mx-3 mt-1 mb-3 flex items-center gap-2 rounded-[8px] border border-border bg-bg-elevated px-2.5 py-[7px]">
          <Search size={13} className="shrink-0 text-fg-faint" />
          <input
            ref={filterInputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilter('')
                e.currentTarget.blur()
              }
            }}
            placeholder="Filter tools, resources…"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-text-primary outline-none placeholder:text-fg-faint"
          />
          <kbd className="rounded-[4px] border border-border px-1.5 py-px font-mono text-[10px] text-fg-faint">
            ⌘K
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col px-3 pt-0.5 pb-4">
            {servers.map((server) => (
              <ServerTree
                key={server.id}
                server={server}
                expanded={expandedServers.has(server.id)}
                expandedGroups={expandedGroups}
                filter={query}
                selectedTool={selectedTool}
                selectedResource={selectedResource}
                selectedPrompt={selectedPrompt}
                onToggleServer={() => toggleServer(server.id)}
                onToggleGroup={(group) => toggleGroup(server.id, group)}
                onSelectTool={(toolName) => selectTool(server.id, toolName)}
                onSelectResource={(uri) => selectResource(server.id, uri)}
                onSelectPrompt={(promptName) => selectPrompt(server.id, promptName)}
                onRefresh={() => refreshCapabilities(server.id)}
                onDelete={() => setPendingDelete(server)}
              />
            ))}
          </div>
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
