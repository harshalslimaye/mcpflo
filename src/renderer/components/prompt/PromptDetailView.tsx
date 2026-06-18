import { useRef, useState } from 'react'
import type { Prompt } from '../../../shared/mcp.types'
import { useServerStore, promptKey } from '../../stores/serverStore'
import { isPromptEmpty } from '../../lib/promptSchema'
import { PromptHeader } from './PromptHeader'
import { PromptRequestPanel, type RequestTab } from './PromptRequestPanel'
import { PromptResultView, type PromptResultTab } from './PromptResultView'
import { History } from '../shared/History'
import { HistoryRail } from '../shared/HistoryRail'
import { ResultDock } from '../shared/ResultDock'
import { useResultDock } from '../shared/useResultDock'

function summarizeArgs(args: Record<string, string>): string {
  const json = JSON.stringify(args)
  return json === '{}' ? 'no arguments' : json
}

interface PromptDetailViewProps {
  prompt: Prompt
  serverId: string
  serverName: string
}

export function PromptDetailView({
  prompt,
  serverId,
  serverName
}: PromptDetailViewProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<RequestTab>('params')
  // A request to pre-fill the Request form with a past get's arguments, raised
  // by clicking a History entry. `nonce` is bumped each click so re-selecting
  // the same record re-applies it.
  const [prefill, setPrefill] = useState<{ args: Record<string, string>; nonce: number } | null>(
    null
  )
  // Lifted here so the sibling Request (button) and Response (busy state) panels
  // share one in-flight signal.
  const [running, setRunning] = useState(false)
  // Kept here so the chosen result tab survives across gets.
  const [resultTab, setResultTab] = useState<PromptResultTab>('preview')
  // The history record whose response the panel shows. Null means "the latest";
  // clicking a History entry pins that record until the next get.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The result dock's open/collapsed/full + height state.
  const dock = useResultDock()
  // Drag reference frame: the full-height center column.
  const centerRef = useRef<HTMLDivElement>(null)

  const key = promptKey(serverId, prompt.name)
  const history = useServerStore((s) => s.promptHistory[key]) ?? []
  // Explicit selection wins; otherwise the latest get. `find` returning
  // undefined (record capped/cleared away) also falls back to the latest.
  const displayed =
    (selectedId ? history.find((r) => r.id === selectedId) : undefined) ?? history[0]
  const getPrompt = useServerStore((s) => s.getPrompt)
  const clearPromptHistory = useServerStore((s) => s.clearPromptHistory)

  // A prompt with no arguments has no form to fill, so selecting a History entry
  // only drives the Response panel and skips the prefill.
  const isEmpty = isPromptEmpty(prompt)

  async function handleExecute(payload: Record<string, string>): Promise<void> {
    // Snap the Response panel back to the get we're about to make, and reveal
    // the dock if it was collapsed.
    setSelectedId(null)
    dock.reveal()
    setRunning(true)
    try {
      await getPrompt(serverId, prompt.name, payload)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex-1 h-full bg-bg-primary flex overflow-hidden">
      {/* Center column: the form scroller (header + Request, padded) with the
          Response dock as a full-bleed band anchored to its bottom. */}
      <div ref={centerRef} className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[18px] px-7 pt-[22px] pb-6">
          <PromptHeader prompt={prompt} serverName={serverName} />
          <PromptRequestPanel
            prompt={prompt}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            prefill={prefill}
            running={running}
            onExecute={handleExecute}
          />
        </div>

        {/* Response dock: always present (minimized by default), revealed on
            get. While a get is in flight it renders the busy state; before any
            run it sits idle. */}
        <ResultDock containerRef={centerRef} dock={dock}>
          <PromptResultView
            record={running ? undefined : displayed}
            busy={running}
            tab={resultTab}
            onTabChange={setResultTab}
            docked
            collapsed={dock.collapsed}
            full={dock.full}
            onToggleCollapse={dock.toggleCollapse}
            onToggleMax={dock.toggleMax}
          />
        </ResultDock>
      </div>

      <HistoryRail count={history.length} onClear={() => clearPromptHistory(serverId, prompt.name)}>
        <History
          records={history}
          emptyLabel="No gets yet."
          selectedId={displayed?.id}
          renderDetail={(record) => (
            <span
              className="block truncate font-mono text-[11px] text-code opacity-85"
              title={summarizeArgs(record.args)}
            >
              {summarizeArgs(record.args)}
            </span>
          )}
          // Selecting an entry always drives the Response panel; for a prompt
          // with arguments it also re-fills the Request form.
          onSelectRecord={(record) => {
            setSelectedId(record.id)
            dock.reveal()
            if (!isEmpty) {
              setPrefill((prev) => ({ args: record.args, nonce: (prev?.nonce ?? 0) + 1 }))
            }
          }}
        />
      </HistoryRail>
    </div>
  )
}
