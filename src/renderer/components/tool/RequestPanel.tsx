import { useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils'
import type { IChangeEvent } from '@rjsf/core'
import type { Tool } from '../../../shared/mcp.types'
import { Toggle } from '../ui/Toggle'
import { SchemaTab } from './SchemaTab'
import { RjsfForm } from './rjsf/RjsfForm'
import { validator } from './rjsf/validator'

export type RequestTab = 'params' | 'schema'
type Mode = 'form' | 'json'

interface RequestPanelProps {
  tool: Tool
  // The tab toggle is owned by the parent so the panel header and the body stay
  // in sync; the form state itself lives here.
  activeTab: RequestTab
  onTabChange: (tab: RequestTab) => void
  // A request to pre-fill the form with a past call's arguments (raised by
  // clicking a History entry). `nonce` changes per click so the same record can
  // be re-applied after the user has edited the form.
  prefill?: { args: Record<string, unknown>; nonce: number } | null
  // Lifted to the parent so the sibling Response panel can show its executing
  // state; here it only drives the button label/disabled state.
  running: boolean
  onExecute: (payload: Record<string, unknown>) => void
}

const TABS: { key: RequestTab; label: string }[] = [
  { key: 'params', label: 'Params' },
  { key: 'schema', label: 'Schema' }
]

function parseJsonObject(
  text: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a JSON object' }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}

export function RequestPanel({
  tool,
  activeTab,
  onTabChange,
  prefill,
  running,
  onExecute
}: RequestPanelProps): React.JSX.Element {
  const schema = tool.inputSchema as RJSFSchema
  // A schema with no declared properties has no form to render.
  const isEmpty = Object.keys(schema.properties ?? {}).length === 0

  // Seed the form with schema-declared defaults so our validity check matches
  // what RJSF renders. Required booleans are seeded to `false`: a toggle always
  // has a value, so an untouched required boolean would otherwise read as
  // "missing" and wedge Execute even though the UI shows a valid (off) state.
  const initialData = useMemo<Record<string, unknown>>(() => {
    const seeded =
      (getDefaultFormState(validator, schema, {}, schema) as Record<string, unknown>) ?? {}
    const props = (schema.properties ?? {}) as Record<string, { type?: unknown }>
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (props[key]?.type === 'boolean' && seeded[key] === undefined) seeded[key] = false
    }
    return seeded
  }, [schema])

  const [mode, setMode] = useState<Mode>('form')
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData)
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(initialData, null, 2))
  const [switchError, setSwitchError] = useState<string | null>(null)

  // RJSF validates the whole schema (nested objects, arrays, unions, …); empty
  // schemas are trivially valid.
  const formValid = useMemo(
    () => isEmpty || validator.isValid(schema, formData, schema),
    [isEmpty, schema, formData]
  )

  const jsonParse = useMemo(() => parseJsonObject(jsonText), [jsonText])
  const jsonValid = jsonParse.ok

  // Clicking a History entry pre-fills the form with that call's arguments. We
  // adjust state during render off the prefill nonce (React's "store previous
  // prop" pattern). Only the form `formData` is touched, so Raw JSON mode and
  // its textarea stay untouched, and nothing executes.
  const [prefillNonce, setPrefillNonce] = useState<number | undefined>(undefined)
  if (prefill && prefill.nonce !== prefillNonce) {
    setPrefillNonce(prefill.nonce)
    setFormData(
      getDefaultFormState(validator, schema, prefill.args, schema) as Record<string, unknown>
    )
  }

  function handleToggleMode(toJson: boolean): void {
    setSwitchError(null)
    if (toJson) {
      setJsonText(JSON.stringify(formData, null, 2))
      setMode('json')
      return
    }
    const result = parseJsonObject(jsonText)
    if (!result.ok) {
      setSwitchError(result.error)
      return
    }
    setFormData(result.value)
    setMode('form')
  }

  const executeDisabled = running || (mode === 'json' ? !jsonValid : !formValid)

  function handleExecute(): void {
    if (executeDisabled) return
    const payload = mode === 'json' ? (jsonParse.ok ? jsonParse.value : {}) : formData
    onExecute(payload)
  }

  return (
    <section
      className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          handleExecute()
        }
      }}
    >
      {/* header: REQUEST · Params/Schema tabs · Raw JSON toggle */}
      <div className="flex items-center gap-4 border-b border-border bg-panel-2 px-4 py-[11px]">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
          Request
        </span>
        <div className="flex gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`rounded-[6px] px-[11px] py-[5px] text-[12.5px] transition-colors ${
                activeTab === tab.key
                  ? 'bg-accent-soft text-accent'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {activeTab === 'params' && !isEmpty && (
          <div className="flex items-center gap-2">
            <Toggle
              checked={mode === 'json'}
              onChange={handleToggleMode}
              aria-label="Edit as raw JSON"
            />
            <span className="text-[12px] text-text-muted">Raw JSON</span>
          </div>
        )}
      </div>

      {/* body */}
      <div className="px-4 py-[18px]">
        {activeTab === 'schema' ? (
          <SchemaTab schema={tool.inputSchema} />
        ) : (
          <div className="flex flex-col gap-4">
            {switchError && <p className="text-xs text-red-400">{switchError}</p>}

            {mode === 'form' ? (
              isEmpty ? (
                <p className="text-sm text-text-muted">This tool takes no parameters.</p>
              ) : (
                <RjsfForm
                  schema={schema}
                  validator={validator}
                  formData={formData}
                  liveValidate
                  showErrorList={false}
                  noHtml5Validate
                  onChange={(e: IChangeEvent) =>
                    setFormData((e.formData ?? {}) as Record<string, unknown>)
                  }
                >
                  {/* Replace RJSF's submit button — the footer Execute button is
                      the trigger. */}
                  <></>
                </RjsfForm>
              )
            ) : (
              <div className="flex flex-col gap-1">
                <textarea
                  aria-label="Params JSON"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  rows={12}
                  spellCheck={false}
                  className="w-full resize-y rounded-[8px] border border-border bg-bg-elevated px-[13px] py-[11px] font-mono text-[13.5px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-line focus:ring-[3px] focus:ring-accent-soft"
                />
                {!jsonValid && <p className="text-xs text-red-400">{jsonParse.error}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* footer: status hint · Execute */}
      <div className="flex items-center gap-3 border-t border-border-soft bg-bg-elevated px-4 py-[13px]">
        <span className="font-mono text-[11.5px] text-fg-faint">
          {executeDisabled && !running ? 'Fill required fields' : 'Ready'}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleExecute}
          disabled={executeDisabled}
          className="inline-flex items-center gap-2 rounded-[8px] bg-[image:var(--btn)] px-[22px] py-[9px] text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={13} fill="currentColor" />
          {running ? 'Executing…' : 'Execute'}
        </button>
      </div>
    </section>
  )
}
