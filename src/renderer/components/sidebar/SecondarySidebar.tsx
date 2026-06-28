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
  Search,
  PanelLeftClose,
  PanelLeft,
  Maximize2,
  Minimize2
} from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'
import { useUiStore } from '../../stores/uiStore'
import { Tooltip } from '../ui/Tooltip'
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

const GROUP_KEYS: GroupKey[] = ['tools', 'resources', 'prompts']

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
  selected: boolean
  selectedTool: SelectedTool | null
  selectedResource: SelectedResource | null
  selectedPrompt: SelectedPrompt | null
  onToggleServer: () => void
  onSelectServer: () => void
  onToggleGroup: (group: GroupKey) => void
  onSelectTool: (toolName: string) => void
  onSelectResource: (uri: string) => void
  onSelectPrompt: (promptName: string) => void
  onDisconnect: () => void
  onRefresh: () => void
  onDelete: () => void
  onClearAuth: () => void
}

function ServerTree({
  server,
  expanded,
  expandedGroups,
  filter,
  selected,
  selectedTool,
  selectedResource,
  selectedPrompt,
  onToggleServer,
  onSelectServer,
  onToggleGroup,
  onSelectTool,
  onSelectResource,
  onSelectPrompt,
  onDisconnect,
  onRefresh,
  onDelete,
  onClearAuth
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
        auth={server.auth}
        credentialsUnavailable={server.credentialsUnavailable}
        selected={selected}
        onToggle={onToggleServer}
        onSelect={onSelectServer}
        onDisconnect={onDisconnect}
        onRefresh={onRefresh}
        onDelete={onDelete}
        onClearAuth={onClearAuth}
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
  const disconnectServer = useServerStore((s) => s.disconnectServer)
  const clearAuth = useServerStore((s) => s.clearAuth)
  const selectedServerId = useServerStore((s) => s.selectedServerId)
  const selectServer = useServerStore((s) => s.selectServer)
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
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  // Normalized query handed to each tree; empty means no filtering.
  const query = filter.trim().toLowerCase()
  // Expand/collapse-all are no-ops with no servers, and while filtering the tree
  // force-expands everything regardless of the Sets — so disable them there.
  const treeControlsDisabled = servers.length === 0 || query.length > 0
  const allExpanded =
    servers.length > 0 &&
    servers.every((s) => expandedServers.has(s.id)) &&
    servers.every((s) => GROUP_KEYS.every((g) => expandedGroups.has(groupId(s.id, g))))

  // ⌘K focuses the filter input; ⌘B toggles the sidebar — both work app-wide.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        filterInputRef.current?.focus()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar])

  function toggleServer(id: string): void {
    setExpandedServers((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    // Lazy fetch: any click on a never-connected server (grey) retries the
    // connect — including the OAuth handshake, which has no separate "Sign in"
    // affordance — regardless of whether the click expands or collapses the
    // row. A disconnected server has no children to show either way, so there's
    // no harm in retrying on a collapse click too. Cached (green) and errored
    // (red) servers refetch only via the refresh button.
    const server = servers.find((s) => s.id === id)
    if (server && server.status === 'disconnected') {
      fetchCapabilities(id)
    }
  }

  // Selects a server for the details view, independent of expand/collapse
  // (which now lives solely on the chevron). Mirrors toggleServer's lazy
  // fetch: a never-connected (grey) server retries the connect on selection
  // too, so its details populate without requiring a separate expand click.
  function selectServerRow(id: string): void {
    selectServer(id)
    const server = servers.find((s) => s.id === id)
    if (server && server.status === 'disconnected') {
      fetchCapabilities(id)
    }
  }

  // Disconnect always forces the row shut, regardless of current expand state,
  // so the next expand re-triggers the lazy-fetch path in toggleServer above.
  function collapseServer(id: string): void {
    setExpandedServers((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function handleDisconnect(id: string): void {
    disconnectServer(id)
    collapseServer(id)
  }

  function toggleGroup(serverId: string, group: GroupKey): void {
    const key = groupId(serverId, group)
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Expand every server and every capability group in one click. Mirrors the
  // lazy-fetch behavior of toggleServer: never-fetched (grey) servers fetch on
  // expand so their trees actually populate.
  function expandAll(): void {
    setExpandedServers(new Set(servers.map((s) => s.id)))
    setExpandedGroups(new Set(servers.flatMap((s) => GROUP_KEYS.map((g) => groupId(s.id, g)))))
    for (const server of servers) {
      if (server.status === 'disconnected') fetchCapabilities(server.id)
    }
  }

  function collapseAll(): void {
    setExpandedServers(new Set())
    setExpandedGroups(new Set())
  }

  return (
    <>
      <div
        className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-bg-surface transition-[width] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: collapsed ? 40 : 268 }}
      >
        {/* Slim rail shown when collapsed: just the expand affordance. */}
        {collapsed && (
          <Tooltip label="Expand sidebar (⌘B)" side="right">
            <button
              aria-label="Expand sidebar"
              onClick={toggleSidebar}
              className="mx-1.5 mt-3 flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-fg-faint transition-colors hover:bg-card-2 hover:text-text-muted"
            >
              <PanelLeft size={16} />
            </button>
          </Tooltip>
        )}

        {/* Full content is kept mounted at its natural width and clipped while
            collapsing so the drawer slides rather than reflowing. */}
        <div
          className={`flex w-[268px] min-w-[268px] flex-1 flex-col overflow-hidden transition-opacity duration-150 ${
            collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          aria-hidden={collapsed}
        >
          <div className="px-4 pt-4 pb-2.5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-bold tracking-[0.12em] uppercase text-fg-faint">
                MCP Servers
              </h2>
              <div className="flex items-center gap-1">
                <Tooltip label={allExpanded ? 'Collapse all' : 'Expand all'} side="bottom">
                  <button
                    aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
                    onClick={allExpanded ? collapseAll : expandAll}
                    disabled={treeControlsDisabled}
                    className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-fg-faint transition-colors hover:bg-card-2 hover:text-text-muted disabled:pointer-events-none disabled:opacity-40"
                  >
                    {allExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </Tooltip>
                <Tooltip label="Collapse sidebar (⌘B)" side="bottom">
                  <button
                    aria-label="Collapse sidebar"
                    onClick={toggleSidebar}
                    className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-fg-faint transition-colors hover:bg-card-2 hover:text-text-muted"
                  >
                    <PanelLeftClose size={15} />
                  </button>
                </Tooltip>
              </div>
            </div>
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
                  selected={selectedServerId === server.id}
                  selectedTool={selectedTool}
                  selectedResource={selectedResource}
                  selectedPrompt={selectedPrompt}
                  onToggleServer={() => toggleServer(server.id)}
                  onSelectServer={() => selectServerRow(server.id)}
                  onToggleGroup={(group) => toggleGroup(server.id, group)}
                  onSelectTool={(toolName) => selectTool(server.id, toolName)}
                  onSelectResource={(uri) => selectResource(server.id, uri)}
                  onSelectPrompt={(promptName) => selectPrompt(server.id, promptName)}
                  onDisconnect={() => handleDisconnect(server.id)}
                  onRefresh={() => refreshCapabilities(server.id)}
                  onDelete={() => setPendingDelete(server)}
                  onClearAuth={() => clearAuth(server.id)}
                />
              ))}
            </div>
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
