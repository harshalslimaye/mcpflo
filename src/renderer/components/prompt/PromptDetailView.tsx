import { useState } from 'react'
import type { Prompt } from '../../../shared/mcp.types'
import { useServerStore, promptKey } from '../../stores/serverStore'
import { isPromptEmpty } from '../../lib/promptSchema'
import { PromptHeader } from './PromptHeader'
import { PromptRequestPanel, type RequestTab } from './PromptRequestPanel'
import { PromptResultView, type PromptResultTab } from './PromptResultView'
import { History } from '../shared/History'
import { HistoryRail } from '../shared/HistoryRail'

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

  const key = promptKey(serverId, prompt.name)
  const history = useServerStore((s) => s.promptHistory[key]) ?? []
  const latestGet = history[0]
  const getPrompt = useServerStore((s) => s.getPrompt)
  const clearPromptHistory = useServerStore((s) => s.clearPromptHistory)

  // A prompt with no arguments has no form to fill, so History entries aren't
  // clickable for it.
  const isEmpty = isPromptEmpty(prompt)

  async function handleExecute(payload: Record<string, string>): Promise<void> {
    setRunning(true)
    try {
      await getPrompt(serverId, prompt.name, payload)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex-1 h-full bg-bg-primary flex flex-col overflow-hidden">
      <div className="flex flex-col gap-[18px] flex-1 min-h-0 px-7 pt-[22px] pb-6">
        <PromptHeader prompt={prompt} serverName={serverName} />

        {/* Request + Response stacked on the left; History rail on the right. */}
        <div className="flex gap-6 items-stretch flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col gap-[18px]">
            <PromptRequestPanel
              prompt={prompt}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              prefill={prefill}
              running={running}
              onExecute={handleExecute}
            />

            {/* Response of the most recent get. While a get is in flight the same
                panel renders its busy state. */}
            {(running || latestGet) && (
              <PromptResultView
                record={running ? undefined : latestGet}
                tab={resultTab}
                onTabChange={setResultTab}
              />
            )}
          </div>

          <HistoryRail
            count={history.length}
            onClear={() => clearPromptHistory(serverId, prompt.name)}
          >
            <History
              records={history}
              emptyLabel="No gets yet."
              renderDetail={(record) => (
                <span
                  className="block truncate font-mono text-[11px] text-code opacity-85"
                  title={summarizeArgs(record.args)}
                >
                  {summarizeArgs(record.args)}
                </span>
              )}
              onSelectRecord={
                isEmpty
                  ? undefined
                  : (record) =>
                      setPrefill((prev) => ({ args: record.args, nonce: (prev?.nonce ?? 0) + 1 }))
              }
            />
          </HistoryRail>
        </div>
      </div>
    </div>
  )
}
