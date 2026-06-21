import { Component, useState, type ReactNode } from 'react'
import type { ToolCallContent, ToolCallResult } from '../../../shared/mcp.types'

// ── helpers ──────────────────────────────────────────────────────────────────

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

// Decoded size of a base64 payload, rounded to whole KB.
function base64SizeKb(data: string): number {
  return Math.round((data.length * 3) / 4 / 1024)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

// ── shared presentational pieces ─────────────────────────────────────────────

function TypeBadge({ label }: { label: string }): React.JSX.Element {
  return (
    <span className="self-start px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border border-border bg-bg-primary text-text-muted">
      {label}
    </span>
  )
}

function BlockCard({ badge, children }: { badge: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 border border-border rounded bg-bg-elevated p-3">
      <TypeBadge label={badge} />
      {children}
    </div>
  )
}

function JsonBody({ json }: { json: string }): React.JSX.Element {
  return (
    <pre className="font-mono text-xs leading-relaxed border border-border rounded bg-bg-primary p-2 whitespace-pre-wrap break-words text-text-primary">
      {json}
    </pre>
  )
}

// Text rendered through JSON detection: pretty-print when it parses to an
// object/array, otherwise plain text with whitespace preserved verbatim.
function TextBody({ text }: { text: string }): React.JSX.Element {
  const json = tryFormatJson(text)
  if (json !== null) return <JsonBody json={json} />
  return <div className="text-sm whitespace-pre-wrap break-words text-text-primary">{text}</div>
}

function MediaFallback({
  kind,
  mimeType,
  data
}: {
  kind: 'Image' | 'Audio'
  mimeType?: string
  data: string
}): React.JSX.Element {
  return (
    <div className="text-xs text-text-muted">
      {kind} failed to render
      <span className="opacity-70">
        {' '}
        — {mimeType ?? 'unknown type'} · {base64SizeKb(data)} KB
      </span>
    </div>
  )
}

// ── per-type block bodies ────────────────────────────────────────────────────

function ImageBlock({ block }: { block: ToolCallContent }): React.JSX.Element {
  const data = asString(block.data) ?? ''
  const mimeType = asString(block.mimeType)
  const [failed, setFailed] = useState(false)

  return (
    <BlockCard badge="image">
      {failed || data === '' ? (
        <MediaFallback kind="Image" mimeType={mimeType} data={data} />
      ) : (
        <img
          src={`data:${mimeType ?? 'image/png'};base64,${data}`}
          alt="Tool result image"
          onError={() => setFailed(true)}
          className="self-start max-w-full max-h-[300px] object-contain rounded"
        />
      )}
    </BlockCard>
  )
}

function AudioBlock({ block }: { block: ToolCallContent }): React.JSX.Element {
  const data = asString(block.data) ?? ''
  const mimeType = asString(block.mimeType)
  const [failed, setFailed] = useState(false)

  return (
    <BlockCard badge="audio">
      {failed || data === '' ? (
        <MediaFallback kind="Audio" mimeType={mimeType} data={data} />
      ) : (
        <audio
          controls
          src={`data:${mimeType ?? 'audio/wav'};base64,${data}`}
          aria-label="Tool result audio"
          onError={() => setFailed(true)}
          className="w-full max-w-md"
        />
      )}
    </BlockCard>
  )
}

function ResourceBlock({ block }: { block: ToolCallContent }): React.JSX.Element {
  const resource =
    block.resource !== null && typeof block.resource === 'object'
      ? (block.resource as Record<string, unknown>)
      : {}
  const uri = asString(resource.uri)
  const mimeType = asString(resource.mimeType)
  const text = asString(resource.text)
  const blob = asString(resource.blob)

  return (
    <BlockCard badge="resource">
      <div className="flex items-baseline gap-2 text-xs text-text-muted">
        {uri && <span className="font-mono break-all">{uri}</span>}
        {mimeType && <span className="opacity-70">{mimeType}</span>}
      </div>
      {text !== undefined ? (
        <TextBody text={text} />
      ) : blob !== undefined ? (
        <div className="text-xs text-text-muted">Binary resource · {base64SizeKb(blob)} KB</div>
      ) : (
        <div className="text-xs text-text-muted">Empty resource</div>
      )}
    </BlockCard>
  )
}

function ResourceLinkBlock({ block }: { block: ToolCallContent }): React.JSX.Element {
  const name = asString(block.name)
  const uri = asString(block.uri)
  const mimeType = asString(block.mimeType)
  const description = asString(block.description)

  return (
    <BlockCard badge="resource_link">
      {name && <div className="text-sm text-text-primary font-medium">{name}</div>}
      <div className="flex items-baseline gap-2 text-xs text-text-muted">
        {uri && <span className="font-mono break-all">{uri}</span>}
        {mimeType && <span className="opacity-70">{mimeType}</span>}
      </div>
      {description && <div className="text-xs text-text-muted">{description}</div>}
    </BlockCard>
  )
}

function UnknownBlock({ block }: { block: ToolCallContent }): React.JSX.Element {
  return (
    <BlockCard badge={`unknown: ${block.type}`}>
      <JsonBody json={JSON.stringify(block, null, 2)} />
    </BlockCard>
  )
}

function BlockBody({ block }: { block: ToolCallContent }): React.JSX.Element {
  switch (block.type) {
    case 'text':
      return (
        <BlockCard badge="text">
          <TextBody text={block.text ?? ''} />
        </BlockCard>
      )
    case 'image':
      return <ImageBlock block={block} />
    case 'audio':
      return <AudioBlock block={block} />
    case 'resource':
      return <ResourceBlock block={block} />
    case 'resource_link':
      return <ResourceLinkBlock block={block} />
    default:
      return <UnknownBlock block={block} />
  }
}

// ── error boundary ───────────────────────────────────────────────────────────

// One malformed block must never blank the whole preview; it degrades to a
// card and its siblings keep rendering.
class BlockErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <BlockCard badge="render error">
          <div className="text-xs text-text-muted">This content block failed to render.</div>
        </BlockCard>
      )
    }
    return this.props.children
  }
}

// Stringification happens inside a component (not inline in ResultPreview) so
// the error boundary can catch values JSON.stringify rejects.
function StructuredOutputCard({ value }: { value: unknown }): React.JSX.Element {
  return (
    <BlockCard badge="structured output">
      <JsonBody json={JSON.stringify(value, null, 2)} />
    </BlockCard>
  )
}

// ── public components ────────────────────────────────────────────────────────

// Renders a single CallToolResult content block, dispatching on `type`.
export function ContentBlockPreview({ block }: { block: ToolCallContent }): React.JSX.Element {
  return (
    <BlockErrorBoundary>
      <BlockBody block={block} />
    </BlockErrorBoundary>
  )
}

// Renders a full CallToolResult: every content block in server order (order is
// intentional — text often explains the block that follows), plus the optional
// structured output. `isError` results keep their blocks but get error styling.
export function ResultPreview({ result }: { result: ToolCallResult }): React.JSX.Element {
  const content = Array.isArray(result.content) ? result.content : []
  const isError = result.isError === true

  return (
    <div
      className={`flex flex-col gap-2 ${isError ? 'border border-red-500/40 bg-red-500/5 rounded p-2' : ''}`}
    >
      {content.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-muted">No content returned.</div>
      ) : (
        content.map((block, i) => <ContentBlockPreview key={i} block={block} />)
      )}
      {result.structuredContent !== undefined && (
        <BlockErrorBoundary>
          <StructuredOutputCard value={result.structuredContent} />
        </BlockErrorBoundary>
      )}
    </div>
  )
}
