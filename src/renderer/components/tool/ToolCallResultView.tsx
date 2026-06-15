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

// The Response panel: a bordered panel whose header carries the status chip,
// duration and the result tabs, and whose body scrolls the rendered output.
export function ToolCallResultView({
  record,
  liveNotifications,
  tab,
  onTabChange
}: ToolCallResultViewProps): React.JSX.Element {
  const isError = record?.status === 'error'
  const notifications = record?.notifications ?? liveNotifications ?? []
  const notificationCount = notifications.length

  const tabs: { key: ResultTab; label: string; count?: number }[] = [
    { key: 'preview', label: 'Preview' },
    { key: 'raw', label: 'Raw' },
    { key: 'pretty', label: 'Pretty' },
    { key: 'notifications', label: 'Notifications', count: notificationCount }
  ]

  return (
    <section className="flex min-h-[240px] flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface">
      {/* header: RESPONSE · status · duration · tabs */}
      <div className="flex items-center gap-4 border-b border-border bg-panel-2 px-4 py-[11px]">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
          Response
        </span>

        {record ? (
          <>
            <span
              className={`inline-flex items-center gap-[7px] text-[12.5px] ${
                isError ? 'text-red-500' : 'text-green'
              }`}
            >
              <span
                className={`h-[7px] w-[7px] rounded-full ${
                  isError ? 'bg-red-500' : 'bg-green shadow-[0_0_0_3px_var(--green-soft)]'
                }`}
              />
              {isError && (
                <AlertCircle size={12} className="text-red-500" aria-label="Error icon" />
              )}
              {isError ? 'Error' : 'Success'}
            </span>
            <span className="rounded-[5px] border border-border-soft bg-bg-elevated px-[7px] py-0.5 font-mono text-[11px] text-text-muted">
              {record.durationMs} ms
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-[7px] text-[12.5px] text-text-muted">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-accent" />
            Executing…
          </span>
        )}

        <div className="flex-1" />

        <div className="flex gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={`rounded-[6px] px-[11px] py-[5px] text-[12.5px] transition-colors ${
                tab === t.key
                  ? 'bg-accent-soft text-accent'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <>
                  {' '}
                  <span
                    className={`text-[11px] ${tab === t.key ? 'text-accent' : 'text-fg-faint'}`}
                  >
                    ({t.count})
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'notifications' ? (
          <NotificationsTab notifications={notifications} live={record === undefined} />
        ) : record ? (
          <ResponseBody record={record} tab={tab} />
        ) : (
          <p className="py-6 text-center text-sm text-text-muted">Executing…</p>
        )}
      </div>
    </section>
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
