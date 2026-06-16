import { useState } from 'react'
import type { ResourceReadRecord } from '../../stores/serverStore'
import type { ResourceContent, ResourceReadResult } from '../../../shared/mcp.types'
import { ResultPanel } from '../shared/ResultPanel'
import { highlightJson } from '../shared/json/highlightJson'
import { CopyButton } from '../shared/json/CopyButton'

export type ResourceResultTab = 'preview' | 'raw' | 'pretty'

interface ResourceContentViewProps {
  // Absent while a read is in flight — the view then renders its reading state.
  record?: ResourceReadRecord
  tab: ResourceResultTab
  onTabChange: (tab: ResourceResultTab) => void
}

// Decoded size of a base64 payload, rounded to whole KB.
function base64SizeKb(data: string): number {
  return Math.round((data.length * 3) / 4 / 1024)
}

// If `text` is parseable JSON whose root is an object or array, return it
// re-serialized with 2-space indentation; otherwise null (not beautifiable).
function tryFormatJson(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object') return null
    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
}

// No inner max-height/overflow: the panel body is the single scroll container,
// so Preview / Raw / Pretty all scroll identically.
const errorBox =
  'font-mono text-xs leading-relaxed border border-red-500/40 bg-red-500/5 text-red-500 rounded p-3 whitespace-pre-wrap break-words'

const codeBox =
  'font-mono text-xs leading-relaxed border border-border rounded bg-bg-primary p-2 whitespace-pre-wrap break-words text-text-primary'

function MetaLine({ content }: { content: ResourceContent }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 text-xs text-text-muted">
      <span className="font-mono break-all">{content.uri}</span>
      {content.mimeType && <span className="opacity-70 shrink-0">{content.mimeType}</span>}
    </div>
  )
}

function EntryShell({
  content,
  children
}: {
  content: ResourceContent
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 border border-border rounded bg-bg-elevated p-3">
      <MetaLine content={content} />
      {children}
    </div>
  )
}

// An image resource (base64 blob with an image/* mimeType), with a graceful
// fallback when the data can't be decoded.
function ImageBody({ mimeType, blob }: { mimeType?: string; blob: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="text-xs text-text-muted">
        Image failed to render
        <span className="opacity-70">
          {' '}
          — {mimeType ?? 'unknown type'} · {base64SizeKb(blob)} KB
        </span>
      </div>
    )
  }
  return (
    <img
      src={`data:${mimeType ?? 'image/png'};base64,${blob}`}
      alt="Resource"
      onError={() => setFailed(true)}
      className="self-start max-w-full max-h-[300px] object-contain rounded"
    />
  )
}

// Rich, human-friendly rendering of one content entry: images inline, text with
// JSON pretty-printing when applicable, binary blobs as a size summary.
function PreviewEntry({ content }: { content: ResourceContent }): React.JSX.Element {
  const isImage = content.mimeType?.startsWith('image/') === true
  let body: React.JSX.Element
  if (content.text !== undefined) {
    const json = tryFormatJson(content.text)
    body =
      json !== null ? (
        <pre className={codeBox}>{json}</pre>
      ) : (
        <div className="text-sm whitespace-pre-wrap break-words text-text-primary">
          {content.text}
        </div>
      )
  } else if (content.blob !== undefined) {
    body = isImage ? (
      <ImageBody mimeType={content.mimeType} blob={content.blob} />
    ) : (
      <div className="text-xs text-text-muted">
        Binary resource · {base64SizeKb(content.blob)} KB
      </div>
    )
  } else {
    body = <div className="text-xs text-text-muted">Empty resource.</div>
  }

  return <EntryShell content={content}>{body}</EntryShell>
}

export function ResourceContentView({
  record,
  tab,
  onTabChange
}: ResourceContentViewProps): React.JSX.Element {
  const tabs: { key: ResourceResultTab; label: string }[] = [
    { key: 'preview', label: 'Preview' },
    { key: 'raw', label: 'Raw' },
    { key: 'pretty', label: 'Pretty' }
  ]

  return (
    <ResultPanel
      busyLabel="Reading…"
      record={record}
      tabs={tabs}
      activeTab={tab}
      onTabChange={onTabChange}
    >
      {record ? (
        <ResponseBody record={record} tab={tab} />
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">Reading…</p>
      )}
    </ResultPanel>
  )
}

// Renders the Preview / Raw / Pretty view of a read result. Raw and Pretty both
// show the full JSON-RPC envelope (compact vs. indented + highlighted); Preview
// surfaces a transport failure or a JSON-RPC error envelope as an error box.
function ResponseBody({
  record,
  tab
}: {
  record: ResourceReadRecord
  tab: ResourceResultTab
}): React.JSX.Element {
  if (record.response === undefined) {
    return <pre className={errorBox}>{record.error ?? 'No response received.'}</pre>
  }

  // Raw and Pretty both show the whole envelope (including an error envelope, so
  // neither collapses to an error box) — Raw serialized as-is, Pretty indented
  // and syntax-highlighted.
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

  // The ReadResourceResult lives inside the JSON-RPC envelope; an error envelope
  // carries `error` instead and has no contents to render.
  const envelope = record.response as { result?: unknown; error?: unknown }
  const result =
    envelope.result !== null && typeof envelope.result === 'object'
      ? (envelope.result as ResourceReadResult)
      : undefined

  if (!result) {
    // JSON-RPC error envelope — no contents; show the protocol error.
    return (
      <pre className={errorBox}>{JSON.stringify(envelope.error ?? record.response, null, 2)}</pre>
    )
  }

  const contents = Array.isArray(result.contents) ? result.contents : []
  if (contents.length === 0) {
    return <div className="py-8 text-center text-sm text-text-muted">No content returned.</div>
  }

  return (
    <div className="flex flex-col gap-2">
      {contents.map((content, i) => (
        <PreviewEntry key={i} content={content} />
      ))}
    </div>
  )
}
