import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

interface TestScriptEditorProps {
  value: string
  onChange: (value: string) => void
  // Shown in place of the editor content — used for the load-in-flight moment
  // right after a tool/prompt/resource is selected, before its saved script
  // (if any) comes back from disk.
  placeholder?: string
}

// Built from the app's own CSS custom properties (base.css) rather than
// CodeMirror's stock light/dark presets, so the editor sits flush with the
// surrounding panel instead of showing its own generic theme. Since these are
// all `var(--...)` references, the same static extension repaints correctly
// on a theme toggle (base.css flips the values under `[data-theme='dark']`) —
// no re-render or theme prop needed here.
const appTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)'
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--accent-soft) !important'
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--bg-surface)'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--fg-faint)',
    border: 'none'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--bg-surface)'
  },
  '.cm-placeholder': {
    color: 'var(--text-muted)'
  }
})

// Same token categories/colors as highlightJson.tsx's JSON highlighter (that
// one via fixed Tailwind classes, this one via the equivalent hex values —
// CodeMirror's theme API takes real CSS colors, not utility class names) —
// so JS syntax highlighting here and JSON highlighting in the Pretty tab read
// as one consistent palette rather than two different editors' worth of guesses.
const syntaxColors = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.string, color: '#059669' },
    { tag: [t.number, t.bool, t.null], color: '#d97706' },
    { tag: t.propertyName, color: '#0284c7' },
    { tag: t.keyword, color: '#9333ea' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--accent)' },
    { tag: t.variableName, color: 'var(--text-primary)' },
    { tag: t.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
    { tag: t.operator, color: 'var(--text-muted)' }
  ])
)

const EXTENSIONS = [javascript(), appTheme, syntaxColors]

// A Bruno-style test() + expect() script editor, shared across the tool,
// prompt, and resource Tests tabs. Deliberately thin — script persistence
// (load/debounced autosave) is the caller's concern, since each kind loads and
// saves against a different (serverId, kind, name) key.
export function TestScriptEditor({
  value,
  onChange,
  placeholder
}: TestScriptEditorProps): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-[8px] border border-border">
      <CodeMirror
        value={value}
        onChange={onChange}
        // @uiw/react-codemirror defaults `theme` to 'light', which applies
        // its own built-in theme extension — one that otherwise overrides
        // appTheme below (CodeMirror's later-registered extension wins). Opt
        // out entirely so appTheme is the only styling in effect.
        theme="none"
        extensions={EXTENSIONS}
        placeholder={placeholder}
        basicSetup={{ foldGutter: false, highlightActiveLine: false }}
        style={{ fontSize: '13.5px' }}
        height="220px"
      />
    </div>
  )
}
