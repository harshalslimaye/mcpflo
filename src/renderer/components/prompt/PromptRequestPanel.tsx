import { useMemo, useState } from 'react'
import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils'
import type { IChangeEvent } from '@rjsf/core'
import type { Prompt } from '../../../shared/mcp.types'
import { Toggle } from '../ui/Toggle'
import { RequestPanel } from '../shared/RequestPanel'
import { SchemaTab } from '../tool/SchemaTab'
import { RjsfForm } from '../tool/rjsf/RjsfForm'
import { validator } from '../tool/rjsf/validator'
import { buildPromptSchema } from '../../lib/promptSchema'

export type RequestTab = 'params' | 'schema'
type Mode = 'form' | 'json'

interface PromptRequestPanelProps {
  prompt: Prompt
  // The tab toggle is owned by the parent so the panel header and the body stay
  // in sync; the form state itself lives here.
  activeTab: RequestTab
  onTabChange: (tab: RequestTab) => void
  // A request to pre-fill the form with a past get's arguments (raised by
  // clicking a History entry). `nonce` changes per click so the same record can
  // be re-applied after the user has edited the form.
  prefill?: { args: Record<string, string>; nonce: number } | null
  // Lifted to the parent so the sibling Response panel can show its busy state;
  // here it only drives the button label/disabled state.
  running: boolean
  onExecute: (payload: Record<string, string>) => void
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

// prompts/get arguments are a flat map of strings on the wire. The form yields
// strings already; this also coerces any non-string value (a number typed in
// Raw JSON mode) and drops empty/undefined entries so untouched optional fields
// aren't sent as blanks.
function toStringArgs(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue
    out[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  return out
}

export function PromptRequestPanel({
  prompt,
  activeTab,
  onTabChange,
  prefill,
  running,
  onExecute
}: PromptRequestPanelProps): React.JSX.Element {
  const schema = useMemo(() => buildPromptSchema(prompt), [prompt])
  const rjsfSchema = schema as RJSFSchema
  // A prompt with no declared arguments has no form to render.
  const isEmpty = Object.keys(schema.properties ?? {}).length === 0

  // Seed the form with schema-declared defaults so our validity check matches
  // what RJSF renders.
  const initialData = useMemo<Record<string, unknown>>(
    () =>
      (getDefaultFormState(validator, rjsfSchema, {}, rjsfSchema) as Record<string, unknown>) ?? {},
    [rjsfSchema]
  )

  const [mode, setMode] = useState<Mode>('form')
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData)
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(initialData, null, 2))
  const [switchError, setSwitchError] = useState<string | null>(null)

  // RJSF validates the whole schema; empty schemas are trivially valid.
  const formValid = useMemo(
    () => isEmpty || validator.isValid(rjsfSchema, formData, rjsfSchema),
    [isEmpty, rjsfSchema, formData]
  )

  const jsonParse = useMemo(() => parseJsonObject(jsonText), [jsonText])
  const jsonValid = jsonParse.ok

  // Clicking a History entry pre-fills the form with that get's arguments. We
  // adjust state during render off the prefill nonce (React's "store previous
  // prop" pattern). Only the form `formData` is touched, so Raw JSON mode and
  // its textarea stay untouched, and nothing executes.
  const [prefillNonce, setPrefillNonce] = useState<number | undefined>(undefined)
  if (prefill && prefill.nonce !== prefillNonce) {
    setPrefillNonce(prefill.nonce)
    setFormData(
      getDefaultFormState(validator, rjsfSchema, prefill.args, rjsfSchema) as Record<
        string,
        unknown
      >
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
    const raw = mode === 'json' ? (jsonParse.ok ? jsonParse.value : {}) : formData
    onExecute(toStringArgs(raw))
  }

  const headerEnd = (
    <>
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
    </>
  )

  return (
    <RequestPanel
      headerEnd={headerEnd}
      statusHint={executeDisabled && !running ? 'Fill required fields' : 'Ready'}
      run={{
        label: 'Get Prompt',
        busyLabel: 'Getting…',
        busy: running,
        disabled: executeDisabled,
        onRun: handleExecute
      }}
    >
      {activeTab === 'schema' ? (
        <SchemaTab schema={schema} />
      ) : (
        <div className="flex flex-col gap-4">
          {switchError && <p className="text-xs text-red-400">{switchError}</p>}

          {mode === 'form' ? (
            isEmpty ? (
              <p className="text-sm text-text-muted">This prompt takes no arguments.</p>
            ) : (
              <RjsfForm
                schema={rjsfSchema}
                validator={validator}
                formData={formData}
                liveValidate
                showErrorList={false}
                noHtml5Validate
                onChange={(e: IChangeEvent) =>
                  setFormData((e.formData ?? {}) as Record<string, unknown>)
                }
              >
                {/* Replace RJSF's submit button — the footer button is the trigger. */}
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
    </RequestPanel>
  )
}
