import { useEffect, useMemo, useState } from 'react'
import { Wrench, Database, MessageSquare } from 'lucide-react'
import type { MCPServer } from '../../../shared/mcp.types'
import { useServerStore } from '../../stores/serverStore'
import { computeContextBudget } from '../../lib/contextBudget'
import { ServerHeader } from './ServerHeader'
import { ServerActionBar } from './ServerActionBar'
import { AuthDetailsCard } from './AuthDetailsCard'
import { ContextBudgetCard } from './ContextBudgetCard'
import { TestsFolderCard } from './TestsFolderCard'
import { CapabilitySections, type Category } from './CapabilitySections'
import { CapabilitySummaryTile } from './CapabilitySummaryTile'
import { ServerTestsTab } from './ServerTestsTab'
import { DeleteServerModal } from '../servers/DeleteServerModal'
import { GlobalActivityRail } from '../shared/GlobalActivityRail'
import { Tabs, type TabItem } from '../ui/Tabs'

interface ServerDetailViewProps {
  server: MCPServer
}

type DetailTab = 'overview' | 'capabilities' | 'tests'

// The content-area view for a selected server: header, action bar, tabs
// (Overview / Capabilities / Tests), with the activity log on the right rail.
export function ServerDetailView({ server }: ServerDetailViewProps): React.JSX.Element {
  const refreshCapabilities = useServerStore((s) => s.refreshCapabilities)
  const cancelFetch = useServerStore((s) => s.cancelFetch)
  const disconnectServer = useServerStore((s) => s.disconnectServer)
  const clearAuth = useServerStore((s) => s.clearAuth)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Local, not persisted — ContentArea remounts this view per server
  // (`key={server.id}`), which already resets the active tab to Overview on
  // server switch for free.
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  // Set right before switching to the Capabilities tab from a tile click;
  // cleared on any direct click of the Capabilities tab itself, so a stale
  // filter from an earlier tile click doesn't silently narrow a later
  // manual visit. CapabilitySections only reads this once, on mount.
  const [capabilityFilter, setCapabilityFilter] = useState<Category | undefined>(undefined)
  // Which capabilities have a saved test script, as `${kind}::${name}` keys —
  // fetched once here (not inside ServerTestsTab) so the Tests tab's count
  // badge is accurate even before that tab has ever been opened.
  const [scripted, setScripted] = useState<Set<string> | undefined>(undefined)

  useEffect(() => {
    if (!window.api?.testing) return
    let active = true
    window.api.testing
      .listScripts(server.id)
      .then((scripts) => {
        if (active) setScripted(new Set(scripts.map(({ kind, name }) => `${kind}::${name}`)))
      })
      .catch(() => {
        if (active) setScripted(new Set())
      })
    return () => {
      active = false
    }
  }, [server.id])

  // AuthDetailsCard renders once the server is authenticated OR needs
  // re-auth (its own async fetch fills in underneath for the former — see its
  // comment), so gating the side-by-side layout on the same condition keeps
  // this decision in sync with whether the card actually occupies a grid cell.
  const showAuthCard =
    server.auth?.status === 'authenticated' || server.auth?.status === 'auth_required'

  const { tools, resources, prompts } = server
  const budget = useMemo(
    () => computeContextBudget({ tools, resources, prompts }),
    [tools, resources, prompts]
  )

  function handleTabBarChange(tab: DetailTab): void {
    setActiveTab(tab)
    if (tab === 'capabilities') setCapabilityFilter(undefined)
  }

  function handleTileClick(category: Category): void {
    setCapabilityFilter(category)
    setActiveTab('capabilities')
  }

  const tabs: TabItem<DetailTab>[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'capabilities', label: 'Capabilities', count: budget.total.count },
    { key: 'tests', label: 'Tests', count: scripted?.size }
  ]

  return (
    <div className="flex-1 h-full bg-bg-primary flex overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[18px] px-7 pt-[22px] pb-6 @container">
          <ServerHeader server={server} />
          <ServerActionBar
            server={server}
            onDisconnect={() => disconnectServer(server.id)}
            onReload={() => refreshCapabilities(server.id)}
            onCancel={() => cancelFetch(server.id)}
            onSignOut={() => clearAuth(server.id)}
            onDelete={() => setConfirmingDelete(true)}
          />

          {/* Scrolls horizontally rather than clipping/wrapping when the three
              tabs (with their count badges) don't fit a narrow window — same
              no-scrollbar treatment ResultPanel's docked tab row uses. */}
          <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b border-border no-scrollbar">
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={handleTabBarChange}
              flushBottom
            />
          </div>

          {activeTab === 'overview' && (
            <>
              {budget.total.count > 0 && (
                <div className="grid shrink-0 grid-cols-1 gap-3 @min-[760px]:grid-cols-3">
                  <CapabilitySummaryTile
                    icon={<Wrench size={14} />}
                    label="Tools"
                    count={budget.tools.count}
                    tokens={budget.tools.tokens}
                    onClick={() => handleTileClick('tools')}
                  />
                  <CapabilitySummaryTile
                    icon={<Database size={14} />}
                    label="Resources"
                    count={budget.resources.count}
                    tokens={budget.resources.tokens}
                    onClick={() => handleTileClick('resources')}
                  />
                  <CapabilitySummaryTile
                    icon={<MessageSquare size={14} />}
                    label="Prompts"
                    count={budget.prompts.count}
                    tokens={budget.prompts.tokens}
                    onClick={() => handleTileClick('prompts')}
                  />
                </div>
              )}

              {showAuthCard ? (
                <div className="grid shrink-0 grid-cols-1 items-stretch gap-[14px] @min-[760px]:grid-cols-[minmax(260px,380px)_1fr]">
                  <AuthDetailsCard server={server} />
                  <ContextBudgetCard server={server} />
                </div>
              ) : (
                <ContextBudgetCard server={server} />
              )}
              <TestsFolderCard server={server} />
            </>
          )}

          {activeTab === 'capabilities' && (
            <CapabilitySections server={server} initialFilter={capabilityFilter} />
          )}

          {activeTab === 'tests' && (
            <ServerTestsTab server={server} scripted={scripted} onScriptedChange={setScripted} />
          )}
        </div>
      </div>

      <GlobalActivityRail />

      {confirmingDelete && (
        <DeleteServerModal
          serverId={server.id}
          serverName={server.name}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
