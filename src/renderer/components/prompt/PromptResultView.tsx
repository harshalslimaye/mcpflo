import type { PromptGetRecord } from '../../stores/serverStore'
import type { GetPromptResult, PromptMessage } from '../../../shared/mcp.types'
import { ResultPanel } from '../shared/ResultPanel'
import { ContentBlockPreview } from '../tool/ContentBlockPreview'
import { highlightJson } from '../shared/json/highlightJson'
import { CopyButton } from '../shared/json/CopyButton'

export type PromptResultTab = 'preview' | 'raw' | 'pretty'

interface PromptResultViewProps {
  // Absent while a get is in flight — the view then renders its busy state.
  record?: PromptGetRecord
  tab: PromptResultTab
  onTabChange: (tab: PromptResultTab) => void
}

const errorBox =
  'font-mono text-xs leading-relaxed border border-red-500/40 bg-red-500/5 text-red-500 rounded p-3 whitespace-pre-wrap break-words'

// One rendered prompt message: a role label above its single content block.
function MessageEntry({ message }: { message: PromptMessage }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {message.role}
      </span>
      <ContentBlockPreview block={message.content} />
    </div>
  )
}

export function PromptResultView({
  record,
  tab,
  onTabChange
}: PromptResultViewProps): React.JSX.Element {
  const tabs: { key: PromptResultTab; label: string }[] = [
    { key: 'preview', label: 'Preview' },
    { key: 'raw', label: 'Raw' },
    { key: 'pretty', label: 'Pretty' }
  ]

  return (
    <ResultPanel
      busyLabel="Getting…"
      record={record}
      tabs={tabs}
      activeTab={tab}
      onTabChange={onTabChange}
    >
      {record ? (
        <ResponseBody record={record} tab={tab} />
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">Getting…</p>
      )}
    </ResultPanel>
  )
}

// Renders the Preview / Raw / Pretty view of a get result. Raw and Pretty both
// show the full JSON-RPC envelope (compact vs. indented + highlighted); Preview
// surfaces a transport failure or a JSON-RPC error envelope as an error box.
function ResponseBody({
  record,
  tab
}: {
  record: PromptGetRecord
  tab: PromptResultTab
}): React.JSX.Element {
  if (record.response === undefined) {
    return <pre className={errorBox}>{record.error ?? 'No response received.'}</pre>
  }

  if (tab === 'raw' || tab === 'pretty') {
    const json =
      tab === 'pretty' ? JSON.stringify(record.response, null, 2) : JSON.stringify(record.response)
    return (
      <div className="relative">
        <CopyButton text={json} />
        <pre className="font-mono text-xs leading-relaxed border border-border rounded bg-bg-elevated p-3 pr-16 whitespace-pre-wrap break-words text-text-primary">
          {tab === 'pretty' ? highlightJson(json) : json}
        </pre>
      </div>
    )
  }

  // The GetPromptResult lives inside the JSON-RPC envelope; an error envelope
  // carries `error` instead and has no messages to render.
  const envelope = record.response as { result?: unknown; error?: unknown }
  const result =
    envelope.result !== null && typeof envelope.result === 'object'
      ? (envelope.result as GetPromptResult)
      : undefined

  if (!result) {
    return (
      <pre className={errorBox}>{JSON.stringify(envelope.error ?? record.response, null, 2)}</pre>
    )
  }

  const messages = Array.isArray(result.messages) ? result.messages : []

  return (
    <div className="flex flex-col gap-3">
      {result.description && (
        <p className="text-[13.5px] leading-[1.55] text-text-muted">{result.description}</p>
      )}
      {messages.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-muted">No messages returned.</div>
      ) : (
        messages.map((message, i) => <MessageEntry key={i} message={message} />)
      )}
    </div>
  )
}
