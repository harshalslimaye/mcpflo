import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import type { ResourceReadRecord } from '../../stores/serverStore'
import type { ResourceContent, ResourceReadResult } from '../../../shared/mcp.types'
import { highlightJson } from '../tool/highlightJson'
import { CopyButton } from '../tool/jsonView'

export type ResourceResultTab = 'preview' | 'content' | 'raw'

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
// re-serialized with 2-space indentation; otherwise null (render as plain text).
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

const errorBox =
  'font-mono text-xs leading-relaxed border border-red-500/40 bg-red-500/5 text-red-500 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap break-words'

function MetaLine({ content }: { content: ResourceContent }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 text-xs text-text-muted">
      <span className="font-mono break-all">{content.uri}</span>
      {content.mimeType && <span className="opacity-70 shrink-0">{content.mimeType}</span>}
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
        <pre className="font-mono text-xs leading-relaxed border border-border rounded bg-bg-primary p-2 overflow-auto max-h-80 whitespace-pre-wrap break-words text-text-primary">
          {json}
        </pre>
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

  return (
    <div className="flex flex-col gap-2 border border-border rounded bg-bg-elevated p-3">
      <MetaLine content={content} />
      {body}
    </div>
  )
}

// Data-focused rendering of one content entry: metadata plus the verbatim text
// (or a blob summary), no media rendering or JSON reformatting.
function ContentEntry({ content }: { content: ResourceContent }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 border border-border rounded bg-bg-elevated p-3">
      <MetaLine content={content} />
      {content.text !== undefined ? (
        <pre className="font-mono text-xs leading-relaxed border border-border rounded bg-bg-primary p-2 overflow-auto max-h-80 whitespace-pre-wrap break-words text-text-primary">
          {content.text}
        </pre>
      ) : content.blob !== undefined ? (
        <div className="text-xs text-text-muted">
          Binary resource · {base64SizeKb(content.blob)} KB
        </div>
      ) : (
        <div className="text-xs text-text-muted">Empty resource.</div>
      )}
    </div>
  )
}

export function ResourceContentView({
  record,
  tab,
  onTabChange
}: ResourceContentViewProps): React.JSX.Element {
  const isError = record?.status === 'error'

  const tabs: { key: ResourceResultTab; label: string }[] = [
    { key: 'preview', label: 'Preview' },
    { key: 'content', label: 'Content' },
    { key: 'raw', label: 'Raw' }
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
      <span className="text-text-muted">Reading…</span>
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

      {record ? (
        <ResponseBody record={record} tab={tab} />
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">Reading…</p>
      )}
    </div>
  )
}

// Renders the Preview / Content / Raw view of a read result. A transport failure
// (no envelope) and a JSON-RPC error envelope both surface as an error box on
// every tab.
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

  const pretty = JSON.stringify(record.response, null, 2)

  // The ReadResourceResult lives inside the JSON-RPC envelope; an error envelope
  // carries `error` instead and has no contents to render.
  const envelope = record.response as { result?: unknown; error?: unknown }
  const result =
    envelope.result !== null && typeof envelope.result === 'object'
      ? (envelope.result as ResourceReadResult)
      : undefined
  const contents = result && Array.isArray(result.contents) ? result.contents : []

  if (tab === 'raw') {
    return (
      <div className="relative">
        <CopyButton text={pretty} />
        <pre className="font-mono text-xs leading-relaxed border border-border rounded bg-bg-elevated p-3 pr-16 overflow-auto max-h-96 whitespace-pre-wrap break-words text-text-primary">
          {highlightJson(pretty)}
        </pre>
      </div>
    )
  }

  if (!result) {
    // JSON-RPC error envelope — no contents; show the protocol error.
    return (
      <pre className={errorBox}>{JSON.stringify(envelope.error ?? record.response, null, 2)}</pre>
    )
  }

  if (contents.length === 0) {
    return <div className="py-8 text-center text-sm text-text-muted">No content returned.</div>
  }

  return (
    <div className="flex flex-col gap-2">
      {contents.map((content, i) =>
        tab === 'preview' ? (
          <PreviewEntry key={i} content={content} />
        ) : (
          <ContentEntry key={i} content={content} />
        )
      )}
    </div>
  )
}
