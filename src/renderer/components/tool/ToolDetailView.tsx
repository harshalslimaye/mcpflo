import { useState } from 'react'
import type { Tool } from '../../../shared/mcp.types'
import { useServerStore, toolKey } from '../../stores/serverStore'
import { ToolHeader } from './ToolHeader'
import { ParamsTab } from './ParamsTab'
import { HistoryTab } from './HistoryTab'
import { SchemaTab } from './SchemaTab'

interface ToolDetailViewProps {
  tool: Tool
  serverId: string
  serverName: string
}

type TabKey = 'params' | 'schema'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'params', label: 'Params' },
  { key: 'schema', label: 'Schema' }
]

export function ToolDetailView({
  tool,
  serverId,
  serverName
}: ToolDetailViewProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabKey>('params')
  const history = useServerStore((s) => s.history[toolKey(serverId, tool.name)]) ?? []

  return (
    // Height-constrained so the History rail can fill the full content height.
    // pb-5 (20px) leaves breathing room below both columns.
    <div className="flex-1 h-full bg-bg-primary flex flex-col overflow-hidden">
      <div className="flex flex-col gap-5 flex-1 min-h-0 px-6 pt-6 pb-5">
        <ToolHeader tool={tool} serverName={serverName} />

        {/* Two columns: tabbed content on the left (scrolls independently),
            History on the right rail stretched to full height. */}
        <div className="flex gap-6 items-stretch flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col gap-5 overflow-y-auto">
            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border shrink-0">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
                    activeTab === tab.key
                      ? 'border-accent text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Params stays mounted so form state survives tab switches; it's
                only reset when the selected tool changes (view is remounted). */}
            <div className={activeTab === 'params' ? '' : 'hidden'}>
              <ParamsTab tool={tool} serverId={serverId} />
            </div>
            {activeTab === 'schema' && <SchemaTab schema={tool.inputSchema} />}
          </div>

          <aside className="w-80 shrink-0 flex flex-col gap-2 min-h-0">
            <h2 className="text-text-muted text-xs uppercase tracking-wider font-medium shrink-0">
              History
            </h2>
            <div className="border border-border rounded bg-bg-elevated flex-1 min-h-0 overflow-y-auto">
              <HistoryTab records={history} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
