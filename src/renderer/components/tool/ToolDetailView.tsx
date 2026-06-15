import { useMemo, useState } from 'react'
import type { Tool } from '../../../shared/mcp.types'
import { useServerStore, toolKey } from '../../stores/serverStore'
import { analyzeSchema } from '../../lib/toolSchema'
import { ToolHeader } from './ToolHeader'
import { RequestPanel, type RequestTab } from './RequestPanel'
import { ToolCallResultView, type ResultTab } from './ToolCallResultView'
import { HistoryTab } from './HistoryTab'

interface ToolDetailViewProps {
  tool: Tool
  serverId: string
  serverName: string
}

export function ToolDetailView({
  tool,
  serverId,
  serverName
}: ToolDetailViewProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<RequestTab>('params')
  // A request to pre-fill the Request form with a past call's arguments, raised
  // by clicking a History entry. `nonce` is bumped each click so re-selecting the
  // same record re-applies it.
  const [prefill, setPrefill] = useState<{ args: Record<string, unknown>; nonce: number } | null>(
    null
  )
  // Lifted here so the sibling Request (button) and Response (executing state)
  // panels share one in-flight signal.
  const [running, setRunning] = useState(false)
  // Kept here so the chosen result tab survives across executions.
  const [resultTab, setResultTab] = useState<ResultTab>('preview')

  const key = toolKey(serverId, tool.name)
  const history = useServerStore((s) => s.history[key]) ?? []
  const latestCall = useServerStore((s) => s.history[key]?.[0])
  const liveNotifications = useServerStore((s) => s.liveNotifications[key])
  const executeTool = useServerStore((s) => s.executeTool)
  const clearHistory = useServerStore((s) => s.clearHistory)

  // A tool with no parameters has no form to fill, so History entries aren't
  // clickable for it.
  const { isEmpty } = useMemo(() => analyzeSchema(tool.inputSchema), [tool.inputSchema])

  async function handleExecute(payload: Record<string, unknown>): Promise<void> {
    setRunning(true)
    try {
      await executeTool(serverId, tool.name, payload)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex-1 h-full bg-bg-primary flex flex-col overflow-hidden">
      <div className="flex flex-col gap-[18px] flex-1 min-h-0 px-7 pt-[22px] pb-6">
        <ToolHeader tool={tool} serverName={serverName} />

        {/* Request + Response stacked on the left; History rail on the right. */}
        <div className="flex gap-6 items-stretch flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col gap-[18px]">
            <RequestPanel
              tool={tool}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              prefill={prefill}
              running={running}
              onExecute={handleExecute}
            />

            {/* Response of the most recent call. While a call is in flight the
                same panel renders its executing state, with live notifications. */}
            {(running || latestCall) && (
              <ToolCallResultView
                record={running ? undefined : latestCall}
                liveNotifications={running ? liveNotifications : undefined}
                tab={resultTab}
                onTabChange={setResultTab}
              />
            )}
          </div>

          <aside className="w-[304px] shrink-0 flex flex-col min-h-0 border-l border-border pl-6">
            <div className="flex items-center gap-2.5 px-1 pb-2.5 shrink-0">
              <h2 className="flex-1 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-faint">
                History
              </h2>
              {history.length > 0 && (
                <>
                  <span className="rounded-full border border-border-soft bg-bg-elevated px-[7px] py-px font-mono text-[10px] text-fg-faint">
                    {history.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => clearHistory(serverId, tool.name)}
                    className="font-mono text-[11px] text-fg-faint transition-colors hover:text-accent"
                  >
                    clear
                  </button>
                </>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <HistoryTab
                records={history}
                onSelectRecord={
                  isEmpty
                    ? undefined
                    : (record) =>
                        setPrefill((prev) => ({ args: record.args, nonce: (prev?.nonce ?? 0) + 1 }))
                }
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
