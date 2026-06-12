import { AlertCircle } from 'lucide-react'
import type { ToolCallRecord } from '../../stores/serverStore'
import type { ToolCallNotification, ToolCallResult } from '../../../shared/mcp.types'
import { ResultPreview } from './ContentBlockPreview'
import { NotificationsTab } from './ToolCallNotifications'
import { highlightJson } from './highlightJson'
import { CopyButton } from './jsonView'

export type ResultTab = 'preview' | 'raw' | 'pretty' | 'notifications'

interface ToolCallResultViewProps {
  // Absent while the call is in flight — the view then renders its executing
  // state, with `liveNotifications` feeding the Notifications tab in real time.
  record?: ToolCallRecord
  liveNotifications?: ToolCallNotification[]
  tab: ResultTab
  onTabChange: (tab: ResultTab) => void
}

export function ToolCallResultView({
  record,
  liveNotifications,
  tab,
  onTabChange
}: ToolCallResultViewProps): React.JSX.Element {
  const isError = record?.status === 'error'
  const notifications = record?.notifications ?? liveNotifications ?? []
  const notificationCount = notifications.length

  const tabs: { key: ResultTab; label: string }[] = [
    { key: 'preview', label: 'Preview' },
    { key: 'raw', label: 'Raw' },
    { key: 'pretty', label: 'Pretty' },
    {
      key: 'notifications',
      label: notificationCount > 0 ? `Notifications (${notificationCount})` : 'Notifications'
    }
  ]

  const statusLine = record ? (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`} />
      {isError && <AlertCircle size={12} className="text-red-500" aria-label="Error icon" />}
      <span className={isError ? 'text-red-500' : 'text-text-primary'}>
        {isError ? 'Error' : 'Success'}
      </span>
      <span className="text-text-muted">{record.durationMs} ms</span>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      <span className="text-text-muted">Executing…</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {statusLine}

      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            className={`px-2.5 py-1.5 text-xs transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'notifications' ? (
        <NotificationsTab notifications={notifications} live={record === undefined} />
      ) : record ? (
        <ResponseBody record={record} tab={tab} />
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">Executing…</p>
      )}
    </div>
  )
}

// Renders the Preview / Raw / Pretty view of the JSON-RPC response. When no
// response arrived at all (transport failure), every response tab shows the
// transport error — the Notifications tab stays reachable above regardless.
function ResponseBody({
  record,
  tab
}: {
  record: ToolCallRecord
  tab: Exclude<ResultTab, 'notifications'>
}): React.JSX.Element {
  if (record.response === undefined) {
    return (
      <pre className="font-mono text-xs leading-relaxed border border-red-500/40 bg-red-500/5 text-red-500 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap break-words">
        {record.error ?? 'No response received.'}
      </pre>
    )
  }

  const compact = JSON.stringify(record.response)
  const pretty = JSON.stringify(record.response, null, 2)

  // The CallToolResult lives inside the JSON-RPC envelope; a JSON-RPC error
  // envelope carries `error` instead and has no tool result to preview.
  const envelope = record.response as { result?: unknown; error?: unknown }
  const toolResult =
    envelope.result !== null && typeof envelope.result === 'object'
      ? (envelope.result as ToolCallResult)
      : undefined

  if (tab === 'preview') {
    return toolResult ? (
      <ResultPreview result={toolResult} />
    ) : (
      // JSON-RPC error envelope — no tool result; show the protocol error.
      <pre className="font-mono text-xs leading-relaxed border border-red-500/40 bg-red-500/5 text-red-500 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap break-words">
        {JSON.stringify(envelope.error ?? record.response, null, 2)}
      </pre>
    )
  }

  return (
    <div className="relative">
      <CopyButton text={tab === 'raw' ? compact : pretty} />
      <pre className="font-mono text-xs leading-relaxed border border-border rounded bg-bg-elevated p-3 pr-16 overflow-auto max-h-96 whitespace-pre-wrap break-words text-text-primary">
        {tab === 'raw' ? compact : highlightJson(pretty)}
      </pre>
    </div>
  )
}
