import type { ToolCallRecord } from '../../stores/serverStore'
import type { ToolCallNotification, ToolCallResult } from '../../../shared/mcp.types'
import { ResultPanel, type DockChrome } from '../shared/ResultPanel'
import { ResultPreview } from './ContentBlockPreview'
import { NotificationsTab } from './ToolCallNotifications'
import { highlightJson } from '../shared/json/highlightJson'
import { CopyButton } from '../shared/json/CopyButton'

export type ResultTab = 'preview' | 'raw' | 'pretty' | 'notifications'

interface ToolCallResultViewProps extends DockChrome {
  // Absent while the call is in flight — the view then renders its executing
  // state, with `liveNotifications` feeding the Notifications tab in real time.
  record?: ToolCallRecord
  // A call is in flight: render the executing state. False with no `record` is
  // the idle state (nothing executed yet).
  busy?: boolean
  liveNotifications?: ToolCallNotification[]
  tab: ResultTab
  onTabChange: (tab: ResultTab) => void
}

// The Response panel: a bordered panel whose header carries the status chip,
// duration and the result tabs, and whose body scrolls the rendered output.
export function ToolCallResultView({
  record,
  busy = false,
  liveNotifications,
  tab,
  onTabChange,
  ...dock
}: ToolCallResultViewProps): React.JSX.Element {
  const notifications = record?.notifications ?? liveNotifications ?? []
  const notificationCount = notifications.length

  const tabs: { key: ResultTab; label: string; count?: number }[] = [
    { key: 'preview', label: 'Preview' },
    { key: 'raw', label: 'Raw' },
    { key: 'pretty', label: 'Pretty' },
    { key: 'notifications', label: 'Notifications', count: notificationCount }
  ]

  return (
    <ResultPanel
      busyLabel="Executing…"
      record={record}
      busy={busy}
      tabs={tabs}
      activeTab={tab}
      onTabChange={onTabChange}
      {...dock}
    >
      {tab === 'notifications' ? (
        <NotificationsTab notifications={notifications} live={busy} />
      ) : record ? (
        <ResponseBody record={record} tab={tab} />
      ) : busy ? (
        <p className="py-6 text-center text-sm text-text-muted">Executing…</p>
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">
          Execute the tool to see its response.
        </p>
      )}
    </ResultPanel>
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
  if (record.responseTruncated) {
    return (
      <p className="rounded border border-border bg-bg-elevated p-3 text-sm text-text-muted">
        Response exceeded the in-memory size limit and was not retained.
      </p>
    )
  }

  if (record.response === undefined) {
    return (
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-red-500/40 bg-red-500/5 p-3 font-mono text-xs leading-relaxed text-red-500">
        {record.error ?? 'No response received.'}
      </pre>
    )
  }

  const compact = JSON.stringify(record.response)
  const pretty = JSON.stringify(record.response, null, 2)

  const envelope = record.response as { result?: unknown; error?: unknown }
  const toolResult =
    envelope.result !== null && typeof envelope.result === 'object'
      ? (envelope.result as ToolCallResult)
      : undefined

  if (tab === 'preview') {
    return toolResult ? (
      <ResultPreview result={toolResult} />
    ) : (
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-red-500/40 bg-red-500/5 p-3 font-mono text-xs leading-relaxed text-red-500">
        {JSON.stringify(envelope.error ?? record.response, null, 2)}
      </pre>
    )
  }

  return (
    <div className="relative">
      <CopyButton text={tab === 'raw' ? compact : pretty} />
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-bg-elevated p-3 pr-16 font-mono text-xs leading-relaxed text-text-primary">
        {tab === 'raw' ? compact : highlightJson(pretty)}
      </pre>
    </div>
  )
}
