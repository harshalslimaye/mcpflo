import { useCallback, useMemo, useState } from 'react'
import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils'
import type { IChangeEvent } from '@rjsf/core'
import type { Tool } from '../../../shared/mcp.types'
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
import { SchemaTab } from './SchemaTab'
import { RjsfForm } from './rjsf/RjsfForm'
import { validator } from './rjsf/validator'
import { buildUiSchema } from './rjsf/layout'
import { requiredSummary } from './rjsf/formStatus'
import { estimateToolDefinitionPayload } from '../../lib/contextBudget'
import { seedToolDefaults } from '../../lib/autoArgs'

export type RequestTab = 'params' | 'saved' | 'schema' | 'tokens' | 'tests'
type Mode = 'form' | 'json'

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

export function ToolRequestPanel({
  tool,
  serverId,
  activeTab,
  onTabChange,
  prefill,
  running,
  onExecute
}: ToolRequestPanelProps): React.JSX.Element {
  // Load/autosave/flush-on-unmount for the Tests tab — see useTestScript.
  const {
    script,
    hasScript,
    onChange: handleScriptChange
  } = useTestScript(serverId, 'tool', tool.name)

  // Named, reusable argument sets for the Saved tab — see useSavedRequests.
  const savedRequests = useSavedRequests(serverId, 'tool', tool.name)

  const schema = tool.inputSchema as RJSFSchema
  // A schema with no declared properties has no form to render.
  const isEmpty = Object.keys(schema.properties ?? {}).length === 0
  // Drives multi-line (textarea) detection; the layout grid lives in the templates.
  const uiSchema = useMemo(() => buildUiSchema(schema), [schema])
  // The tool's own definition cost — static, independent of any call having
  // been made, unlike the Response panel's per-call Tokens tab.
  const definitionEstimate = useMemo(() => estimateToolDefinitionPayload(tool), [tool])

  // Seed the form with schema-declared defaults so our validity check matches
  // what RJSF renders — see seedToolDefaults for why required booleans are a
  // special case.
  const initialData = useMemo<Record<string, unknown>>(() => seedToolDefaults(schema), [schema])

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

  // Load copies a saved request into the live Params form (seeded through
  // schema defaults the same way the History-prefill path does, so a request
  // saved before the schema gained a field still gets a sensible value for
  // it) and switches to the Params tab — a one-way copy, not a live binding,
  // so later form edits never mutate the saved entry.
  function handleLoadSavedRequest(request: SavedRequest): void {
    setFormData(
      getDefaultFormState(validator, schema, request.args, schema) as Record<string, unknown>
    )
    setMode('form')
    setTouched(new Set())
    onTabChange('params')
  }

  // Snapshots whatever the live Params form currently holds — the parsed Raw
  // JSON object in JSON mode, or the form state in form mode — under the
  // given name (from the footer Save button's popover; SaveRequestButton
  // itself already defaults an empty name to "Request N"). The button is
  // disabled by its caller when Raw JSON mode doesn't currently parse, so
  // `raw` is only null in a state the button should never have allowed.
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
      : requiredSummary(schema, formData)

  function handleExecute(): void {
    if (executeDisabled) return
    const payload = mode === 'json' ? (jsonParse.ok ? jsonParse.value : {}) : formData
    onExecute(payload)
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
        label: 'Execute',
        busyLabel: 'Executing…',
        busy: running,
        disabled: executeDisabled,
        onRun: handleExecute
      }}
      footerExtra={
        !isEmpty && (
          <SaveRequestButton
            disabled={mode === 'json' && !jsonValid}
            requestCount={savedRequests.requests.length}
            onSave={handleSaveCurrentAs}
          />
        )
      }
    >
      {activeTab === 'saved' ? (
        <div className="flex flex-col gap-3">
          {savedRequests.requests.length === 0 ? (
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
                    schema={schema}
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
