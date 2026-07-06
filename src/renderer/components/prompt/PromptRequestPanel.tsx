import { useCallback, useMemo, useState } from 'react'
import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils'
import type { IChangeEvent } from '@rjsf/core'
import type { Prompt } from '../../../shared/mcp.types'
import type { SavedRequest } from '../../../shared/testing.types'
import { Toggle } from '../ui/Toggle'
import { Tabs, type TabItem } from '../ui/Tabs'
import { RequestPanel } from '../shared/RequestPanel'
import { TokenFootprintView } from '../shared/TokenFootprintView'
import { TestScriptEditor } from '../shared/TestScriptEditor'
import { useTestScript } from '../shared/useTestScript'
import { useSavedRequests } from '../shared/useSavedRequests'
import { SavedRequestRow } from '../shared/SavedRequestRow'
import { SaveRequestButton } from '../shared/SaveRequestButton'
import { SchemaTab } from '../tool/SchemaTab'
import { RjsfForm } from '../tool/rjsf/RjsfForm'
import { validator } from '../tool/rjsf/validator'
import { buildUiSchema } from '../tool/rjsf/layout'
import { requiredSummary } from '../tool/rjsf/formStatus'
import { buildPromptSchema } from '../../lib/promptSchema'
import { estimatePromptDefinitionPayload } from '../../lib/contextBudget'

export type RequestTab = 'params' | 'saved' | 'schema' | 'tokens' | 'tests'
type Mode = 'form' | 'json'

interface PromptRequestPanelProps {
  prompt: Prompt
  serverId: string
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
  { key: 'saved', label: 'Saved' },
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
  serverId,
  activeTab,
  onTabChange,
  prefill,
  running,
  onExecute
}: PromptRequestPanelProps): React.JSX.Element {
  // Load/autosave/flush-on-unmount for the Tests tab — see useTestScript.
  const {
    script,
    hasScript,
    onChange: handleScriptChange
  } = useTestScript(serverId, 'prompt', prompt.name)

  // Named, reusable argument sets for the Saved tab — see useSavedRequests.
  const savedRequests = useSavedRequests(serverId, 'prompt', prompt.name)

  const schema = useMemo(() => buildPromptSchema(prompt), [prompt])
  const rjsfSchema = schema as RJSFSchema
  // A prompt with no declared arguments has no form to render.
  const isEmpty = Object.keys(schema.properties ?? {}).length === 0
  // Drives multi-line (textarea) detection; the layout grid lives in the templates.
  const uiSchema = useMemo(() => buildUiSchema(rjsfSchema), [rjsfSchema])
  // The prompt's own definition cost — static, independent of any get having
  // been made, unlike the Response panel's per-call Tokens tab.
  const definitionEstimate = useMemo(() => estimatePromptDefinitionPayload(prompt), [prompt])

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

  // Track which fields have been blurred so errors surface one field at a time
  // instead of all at once on an untouched form.
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const markTouched = useCallback((id: string) => {
    setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])
  const formContext = useMemo(() => ({ touched, markTouched }), [touched, markTouched])

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

  // Load copies a saved request into the live Params form (seeded through
  // schema defaults the same way the History-prefill path does, so a request
  // saved before the schema gained an argument still gets a sensible value
  // for it) and switches to the Params tab — a one-way copy, not a live
  // binding, so later form edits never mutate the saved entry.
  function handleLoadSavedRequest(request: SavedRequest): void {
    setFormData(
      getDefaultFormState(validator, rjsfSchema, request.args, rjsfSchema) as Record<
        string,
        unknown
      >
    )
    setMode('form')
    setTouched(new Set())
    onTabChange('params')
  }

  // Snapshots whatever the live Params form currently holds — the parsed Raw
  // JSON object in JSON mode, or the raw form state in form mode — under the
  // given name (from the footer Save button's popover; SaveRequestButton
  // itself already defaults an empty name to "Request N"). Stored as raw
  // values, NOT the wire-format string map toStringArgs produces at execute
  // time, so Load can round-trip it straight back into the RJSF form. The
  // button is disabled by its caller when Raw JSON mode doesn't currently
  // parse, so `raw` is only null in a state the button should never allow.
  function handleSaveCurrentAs(name: string): void {
    const raw = mode === 'json' ? (jsonParse.ok ? jsonParse.value : null) : formData
    if (raw === null) return
    savedRequests.add(name, raw)
  }

  const executeDisabled = running || (mode === 'json' ? !jsonValid : !formValid)

  // Footer hint: required/missing counts in form mode, JSON validity in JSON mode.
  const statusHint = isEmpty
    ? 'Ready'
    : mode === 'json'
      ? jsonValid
        ? 'Ready'
        : 'Invalid JSON'
      : requiredSummary(rjsfSchema, formData)

  function handleExecute(): void {
    if (executeDisabled) return
    const raw = mode === 'json' ? (jsonParse.ok ? jsonParse.value : {}) : formData
    onExecute(toStringArgs(raw))
  }

  const tabItems: TabItem<RequestTab>[] = TABS.map((tab) => {
    if (tab.key === 'tests' && hasScript) return { ...tab, dotLabel: 'Has a saved test script' }
    if (tab.key === 'saved' && savedRequests.requests.length > 0) {
      return { ...tab, count: savedRequests.requests.length }
    }
    return tab
  })

  const headerEnd = (
    <>
      <Tabs tabs={tabItems} activeTab={activeTab} onTabChange={onTabChange} />
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
        label: 'Get Prompt',
        busyLabel: 'Getting…',
        busy: running,
        disabled: executeDisabled,
        onRun: handleExecute
      }}
      footerExtra={
        !isEmpty && (
          <SaveRequestButton
            // Also disabled until the mount fetch resolves — saving earlier
            // would persist just the new entry over whatever's already on
            // disk, since `savedRequests.requests` still reads as empty.
            disabled={(mode === 'json' && !jsonValid) || !savedRequests.loaded}
            requestCount={savedRequests.requests.length}
            onSave={handleSaveCurrentAs}
          />
        )
      }
    >
      {activeTab === 'saved' ? (
        <div className="flex flex-col gap-3">
          {!savedRequests.loaded ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : savedRequests.requests.length === 0 ? (
            <p className="text-sm text-text-muted">
              No saved requests yet. Fill in the Params tab, then save it here as a reusable
              request.
            </p>
          ) : (
            <>
              {savedRequests.testRequestId && (
                <p className="text-[12.5px] text-text-muted">
                  {`Automated test runs use "${
                    savedRequests.requests.find((r) => r.id === savedRequests.testRequestId)?.name
                  }" for this capability.`}
                </p>
              )}
              {/* Bounded + internally scrollable, same pattern as the object-params
                  editor's row list (AddServerModal.tsx) — scrollbar-gutter keeps
                  the border from shifting when the bar appears; the themed
                  scrollbar itself is global (base.css), no extra class needed. */}
              <div className="flex max-h-96 flex-col overflow-y-auto rounded-[8px] border border-border-soft [scrollbar-gutter:stable]">
                {savedRequests.requests.map((r) => (
                  <SavedRequestRow
                    key={r.id}
                    request={r}
                    schema={rjsfSchema}
                    uiSchema={uiSchema}
                    editable={!isEmpty}
                    isTestDefault={savedRequests.testRequestId === r.id}
                    onLoad={() => handleLoadSavedRequest(r)}
                    onUpdateArgs={(args) => savedRequests.updateArgs(r.id, args)}
                    onRename={(newName) => savedRequests.rename(r.id, newName)}
                    onRemove={() => savedRequests.remove(r.id)}
                    onSetTestDefault={() =>
                      savedRequests.setTestRequestId(
                        savedRequests.testRequestId === r.id ? undefined : r.id
                      )
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'schema' ? (
        <SchemaTab schema={schema} />
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
            'test("has a message", function () {\n  expect(res.getText()).to.be.a("string")\n})'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {switchError && <p className="text-xs text-red-400">{switchError}</p>}

          {mode === 'form' ? (
            isEmpty ? (
              <p className="text-sm text-text-muted">This prompt takes no arguments.</p>
            ) : (
              <RjsfForm
                schema={rjsfSchema}
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
