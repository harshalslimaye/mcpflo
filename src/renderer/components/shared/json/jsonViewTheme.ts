// react-json-view is themed entirely through `--w-rjv-*` CSS variables. We map
// its structural colors to the app's theme tokens (so it follows light/dark with
// the rest of the UI) and its syntax colors to the same fixed Tailwind shades
// `highlightJson` uses, so every tree in the app reads identically.
export const TREE_THEME = {
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
