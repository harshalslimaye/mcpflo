import JsonView from '@uiw/react-json-view'
import { expandEmbeddedJson } from './expandEmbeddedJson'
import { highlightJson } from './highlightJson'
import { CopyButton } from './CopyButton'

// Above this serialized size we skip the interactive tree. react-json-view
// mounts a DOM node per key and isn't virtualized, so a multi-megabyte MCP
// response would mount tens of thousands of nodes and jank the panel. Past the
// cap we fall back to the flat highlighted <pre>, which is O(text length) and
// stays snappy at any size.
const TREE_SIZE_LIMIT = 256 * 1024

// react-json-view is themed entirely through `--w-rjv-*` CSS variables. We map
// its structural colors to the app's theme tokens (so it follows light/dark with
// the rest of the UI) and its syntax colors to the same fixed Tailwind shades
// `highlightJson` uses, so the tree and the <pre> fallback read identically.
const TREE_THEME = {
  '--w-rjv-font-family': "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  '--w-rjv-background-color': 'transparent',
  '--w-rjv-color': 'var(--text-primary)',
  '--w-rjv-line-color': 'var(--border)',
  '--w-rjv-arrow-color': 'var(--text-muted)',
  '--w-rjv-info-color': 'var(--text-muted)',
  '--w-rjv-ellipsis-color': 'var(--text-muted)',
  '--w-rjv-brackets-color': 'var(--text-muted)',
  '--w-rjv-curlybraces-color': 'var(--text-muted)',
  '--w-rjv-colon-color': 'var(--text-muted)',
  '--w-rjv-quotes-color': 'var(--text-muted)',
  '--w-rjv-key-string': '#0284c7', // sky-600 — object keys
  '--w-rjv-key-number': 'var(--text-muted)', // array indices
  '--w-rjv-type-string-color': '#059669', // emerald-600
  '--w-rjv-quotes-string-color': '#059669',
  '--w-rjv-type-int-color': '#d97706', // amber-600
  '--w-rjv-type-float-color': '#d97706',
  '--w-rjv-type-bigint-color': '#d97706',
  '--w-rjv-type-boolean-color': '#9333ea', // purple-600
  '--w-rjv-type-null-color': 'var(--text-muted)',
  '--w-rjv-type-undefined-color': 'var(--text-muted)',
  '--w-rjv-type-nan-color': 'var(--text-muted)'
} as React.CSSProperties

const preClass =
  'whitespace-pre-wrap break-words rounded border border-border bg-bg-elevated p-3 pr-16 font-mono text-xs leading-relaxed text-text-primary'

// Pretty-tab renderer: expands embedded-JSON strings, then shows the result as a
// collapsible tree (with a flat-<pre> fast path for oversized payloads). The
// copy button always yields the full indented JSON regardless of which path
// renders, so copying behaves the same in both.
export function PrettyJson({ value }: { value: unknown }): React.JSX.Element {
  const expanded = expandEmbeddedJson(value)
  const json = JSON.stringify(expanded, null, 2)

  // Tree needs an object/array root; oversized or scalar roots take the <pre>.
  const useTree =
    json.length <= TREE_SIZE_LIMIT && expanded !== null && typeof expanded === 'object'

  return (
    <div className="relative">
      <CopyButton text={json} />
      {useTree ? (
        <JsonView
          value={expanded as object}
          style={TREE_THEME}
          displayDataTypes={false}
          enableClipboard={false}
          shortenTextAfterLength={0}
          className="pr-16 font-mono text-xs leading-relaxed"
        />
      ) : (
        <pre className={preClass}>{highlightJson(json)}</pre>
      )}
    </div>
  )
}
