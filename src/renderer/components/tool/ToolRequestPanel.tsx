import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils'
import type { IChangeEvent } from '@rjsf/core'
import type { Tool } from '../../../shared/mcp.types'
import { Toggle } from '../ui/Toggle'
import { RequestPanel } from '../shared/RequestPanel'
import { TokenFootprintView } from '../shared/TokenFootprintView'
import { TestScriptEditor } from '../shared/TestScriptEditor'
import { SchemaTab } from './SchemaTab'
import { RjsfForm } from './rjsf/RjsfForm'
import { validator } from './rjsf/validator'
import { buildUiSchema } from './rjsf/layout'
import { requiredSummary } from './rjsf/formStatus'
import { estimateToolDefinitionPayload } from '../../lib/contextBudget'

export type RequestTab = 'params' | 'schema' | 'tokens' | 'tests'
type Mode = 'form' | 'json'

// Debounce window between the user's last keystroke in the Tests editor and
// the autosave IPC call — short enough that a script survives a tab switch or
// an accidental reload without feeling like a "save" step the user has to
// remember to trigger.
const SCRIPT_AUTOSAVE_DELAY_MS = 500

interface ToolRequestPanelProps {
  tool: Tool
  serverId: string
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
  { key: 'schema', label: 'Schema' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'tests', label: 'Tests' }
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

export function ToolRequestPanel({
  tool,
  serverId,
  activeTab,
  onTabChange,
  prefill,
  running,
  onExecute
}: ToolRequestPanelProps): React.JSX.Element {
  // The saved test script, loaded once per tool (ToolDetailView remounts this
  // whole panel on tool change via a `${serverId}::${tool.name}` key, so there's
  // no stale-tool risk here). Guarded against a missing `window.api.testing` —
  // real Electron always has it (via preload); component tests that render this
  // panel without stubbing it just see an empty, unsaved script instead of
  // throwing.
  const [script, setScript] = useState('')
  const scriptEditedRef = useRef(false)
  useEffect(() => {
    let active = true
    if (!window.api?.testing) return
    window.api.testing.getScript(serverId, 'tool', tool.name).then((saved) => {
      if (active) setScript(saved ?? '')
    })
    return () => {
      active = false
    }
  }, [serverId, tool.name])

  // Debounced autosave — only once the user has actually typed, so re-saving
  // the just-loaded content back to disk on mount is skipped.
  useEffect(() => {
    if (!scriptEditedRef.current || !window.api?.testing) return
    const id = setTimeout(() => {
      window.api.testing.saveScript(serverId, 'tool', tool.name, script)
    }, SCRIPT_AUTOSAVE_DELAY_MS)
    return () => clearTimeout(id)
  }, [script, serverId, tool.name])

  const handleScriptChange = useCallback((next: string) => {
    scriptEditedRef.current = true
    setScript(next)
  }, [])

  const hasScript = script.trim() !== ''

  const schema = tool.inputSchema as RJSFSchema
  // A schema with no declared properties has no form to render.
  const isEmpty = Object.keys(schema.properties ?? {}).length === 0
  // Drives multi-line (textarea) detection; the layout grid lives in the templates.
  const uiSchema = useMemo(() => buildUiSchema(schema), [schema])
  // The tool's own definition cost — static, independent of any call having
  // been made, unlike the Response panel's per-call Tokens tab.
  const definitionEstimate = useMemo(() => estimateToolDefinitionPayload(tool), [tool])

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

  // Track which fields have been blurred so errors surface one field at a time
  // instead of all at once on an untouched form.
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const markTouched = useCallback((id: string) => {
    setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])
  const formContext = useMemo(() => ({ touched, markTouched }), [touched, markTouched])

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
    setTouched(new Set())
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

  // Footer hint: required/missing counts in form mode, JSON validity in JSON mode.
  const statusHint = isEmpty
    ? 'Ready'
    : mode === 'json'
      ? jsonValid
        ? 'Ready'
        : 'Invalid JSON'
      : requiredSummary(schema, formData)

  function handleExecute(): void {
    if (executeDisabled) return
    const payload = mode === 'json' ? (jsonParse.ok ? jsonParse.value : {}) : formData
    onExecute(payload)
  }

  const headerEnd = (
    <>
      <div className="flex gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`inline-flex items-center gap-1.5 rounded-[6px] px-[11px] py-[5px] text-[12.5px] transition-colors ${
              activeTab === tab.key
                ? 'bg-accent-soft text-accent'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
            {tab.key === 'tests' && hasScript && (
              <span
                aria-label="Has a saved test script"
                className="h-1.5 w-1.5 rounded-full bg-accent"
              />
            )}
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
      statusHint={statusHint}
      run={{
        label: 'Execute',
        busyLabel: 'Executing…',
        busy: running,
        disabled: executeDisabled,
        onRun: handleExecute
      }}
    >
      {activeTab === 'schema' ? (
        <SchemaTab schema={tool.inputSchema} />
      ) : activeTab === 'tokens' ? (
        <TokenFootprintView
          title="Definition footprint"
          subjectNoun="definition"
          tokens={definitionEstimate.tokens}
          characters={definitionEstimate.characters}
          rawBytes={definitionEstimate.rawBytes}
        />
      ) : activeTab === 'tests' ? (
        <TestScriptEditor
          value={script}
          onChange={handleScriptChange}
          placeholder={
            'test("returns ok", function () {\n  expect(res.getIsError()).to.equal(false)\n})'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {switchError && <p className="text-xs text-red-400">{switchError}</p>}

          {mode === 'form' ? (
            isEmpty ? (
              <p className="text-sm text-text-muted">This tool takes no parameters.</p>
            ) : (
              <RjsfForm
                schema={schema}
                uiSchema={uiSchema}
                formContext={formContext}
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
    </RequestPanel>
  )
}
