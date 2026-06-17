import { useMemo, useState } from 'react'
import type { Tool } from '../../../shared/mcp.types'
import { useServerStore, toolKey } from '../../stores/serverStore'
import { analyzeSchema } from '../../lib/toolSchema'
import { ToolHeader } from './ToolHeader'
import { ToolRequestPanel, type RequestTab } from './ToolRequestPanel'
import { ToolCallResultView, type ResultTab } from './ToolCallResultView'
import { History } from '../shared/History'
import { HistoryRail } from '../shared/HistoryRail'

function summarizeArgs(args: Record<string, unknown>): string {
  const json = JSON.stringify(args)
  return json === '{}' ? 'no arguments' : json
}

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
  // The history record whose response the panel shows. Null means "the latest";
  // clicking a History entry pins that record until the next execution.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const key = toolKey(serverId, tool.name)
  const history = useServerStore((s) => s.history[key]) ?? []
  // Explicit selection wins; otherwise the latest call. `find` returning
  // undefined (record capped/cleared away) also falls back to the latest.
  const displayed =
    (selectedId ? history.find((r) => r.id === selectedId) : undefined) ?? history[0]
  const liveNotifications = useServerStore((s) => s.liveNotifications[key])
  const executeTool = useServerStore((s) => s.executeTool)
  const clearHistory = useServerStore((s) => s.clearHistory)

  // A tool with no parameters has no form to fill, so selecting a History entry
  // only drives the Response panel and skips the prefill.
  const { isEmpty } = useMemo(() => analyzeSchema(tool.inputSchema), [tool.inputSchema])

  async function handleExecute(payload: Record<string, unknown>): Promise<void> {
    // Snap the Response panel back to the call we're about to make.
    setSelectedId(null)
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
            <ToolRequestPanel
              tool={tool}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              prefill={prefill}
              running={running}
              onExecute={handleExecute}
            />

            {/* Response of the selected (or latest) call. While a call is in
                flight the same panel renders its executing state, with live
                notifications. */}
            {(running || displayed) && (
              <ToolCallResultView
                record={running ? undefined : displayed}
                liveNotifications={running ? liveNotifications : undefined}
                tab={resultTab}
                onTabChange={setResultTab}
              />
            )}
          </div>

          <HistoryRail count={history.length} onClear={() => clearHistory(serverId, tool.name)}>
            <History
              records={history}
              emptyLabel="No calls yet."
              selectedId={displayed?.id}
              renderDetail={(record) => (
                <span
                  className="block truncate font-mono text-[11px] text-code opacity-85"
                  title={summarizeArgs(record.args)}
                >
                  {summarizeArgs(record.args)}
                </span>
              )}
              // Selecting an entry always drives the Response panel; for a tool
              // with parameters it also re-fills the Request form.
              onSelectRecord={(record) => {
                setSelectedId(record.id)
                if (!isEmpty) {
                  setPrefill((prev) => ({ args: record.args, nonce: (prev?.nonce ?? 0) + 1 }))
                }
              }}
            />
          </HistoryRail>
        </div>
      </div>
    </div>
  )
}
