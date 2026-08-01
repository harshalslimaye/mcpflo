import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils'
import type { IChangeEvent } from '@rjsf/core'
import type { ResourceTemplate } from '../../../shared/mcp.types'
import { Toggle } from '../ui/Toggle'
import { Tabs, type TabItem } from '../ui/Tabs'
import { RequestPanel } from '../shared/RequestPanel'
import { SchemaTab } from '../tool/SchemaTab'
import { RjsfForm } from '../tool/rjsf/RjsfForm'
import { validator } from '../tool/rjsf/validator'
import { requiredSummary } from '../tool/rjsf/formStatus'
import {
  buildResourceTemplateSchema,
  buildResourceTemplateUiSchema
} from '../../lib/resourceTemplateSchema'
import { expandTemplate } from '../../lib/uriTemplate'

// Deliberately narrower than the tool and prompt panels: no Saved, Tests or
// Tokens tab. Templates aren't a testing-engine kind, so there is no script to
// edit and no saved-request store keyed to them — see the plan's D7.
export type TemplateRequestTab = 'params' | 'schema'
type Mode = 'form' | 'json'

interface ResourceTemplateRequestPanelProps {
  template: ResourceTemplate
  serverId: string
  // Owned by the parent so the panel header and body stay in sync.
  activeTab: TemplateRequestTab
  onTabChange: (tab: TemplateRequestTab) => void
  // A request to re-fill the form with a past read's values (raised by clicking
  // a History entry). `nonce` changes per click so the same record can be
  // re-applied after the user has edited the form.
  prefill?: { args: Record<string, string>; nonce: number } | null
  running: boolean
  onExecute: (values: Record<string, string>) => void
  // Whether the server declared the `completions` capability.
  completionsSupported?: boolean
}

const TABS: { key: TemplateRequestTab; label: string }[] = [
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

// Template variables are strings on the wire. The form yields strings already;
// this coerces anything else (a number typed in Raw JSON mode) and drops blanks
// so an untouched field reads as absent rather than as an empty segment.
function toStringValues(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue
    out[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  return out
}

export function ResourceTemplateRequestPanel({
  template,
  serverId,
  activeTab,
  onTabChange,
  prefill,
  running,
  onExecute,
  completionsSupported = false
}: ResourceTemplateRequestPanelProps): React.JSX.Element {
  const schema = useMemo(() => buildResourceTemplateSchema(template), [template])
  const rjsfSchema = schema as RJSFSchema
  // A template with no variables is already a concrete URI — nothing to fill in.
  const isEmpty = Object.keys(schema.properties ?? {}).length === 0
  const uiSchema = useMemo(
    () => buildResourceTemplateUiSchema(template, { completions: completionsSupported }),
    [template, completionsSupported]
  )

  const initialData = useMemo<Record<string, unknown>>(
    () =>
      (getDefaultFormState(validator, rjsfSchema, {}, rjsfSchema) as Record<string, unknown>) ?? {},
    [rjsfSchema]
  )

  const [mode, setMode] = useState<Mode>('form')
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData)
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(initialData, null, 2))
  const [switchError, setSwitchError] = useState<string | null>(null)

  // Mirrors `formData` so getContextArgs (below) can read sibling values live,
  // without needing `formContext` to depend on `formData` — that would rebuild
  // it (and re-render every field) on every keystroke. A ref can't be written
  // during render, so this is an effect rather than an inline assignment.
  const formDataRef = useRef(formData)
  useEffect(() => {
    formDataRef.current = formData
  }, [formData])

  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const markTouched = useCallback((id: string) => {
    setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])
  // Stable identity (empty deps, reads the ref) so it never forces
  // `formContext` to be rebuilt.
  const getContextArgs = useCallback((excludeArgName: string): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const [key, val] of Object.entries(formDataRef.current)) {
      if (key === excludeArgName) continue
      if (typeof val === 'string' && val !== '') out[key] = val
    }
    return out
  }, [])
  const formContext = useMemo(
    () => ({
      touched,
      markTouched,
      completion: {
        serverId,
        // The spec wants the raw template here, not a URI it expanded to: the
        // server completes a variable *within* the template it published.
        ref: { type: 'ref/resource' as const, uri: template.uriTemplate },
        getContextArgs
      }
    }),
    [touched, markTouched, serverId, template.uriTemplate, getContextArgs]
  )

  const formValid = useMemo(
    () => isEmpty || validator.isValid(rjsfSchema, formData, rjsfSchema),
    [isEmpty, rjsfSchema, formData]
  )

  const jsonParse = useMemo(() => parseJsonObject(jsonText), [jsonText])
  const jsonValid = jsonParse.ok

  // The values that would actually be sent, from whichever editor is live.
  // Derived once so the preview below and the read itself can never disagree.
  const values = useMemo(() => {
    const raw = mode === 'json' ? (jsonParse.ok ? jsonParse.value : {}) : formData
    return toStringValues(raw)
  }, [mode, jsonParse, formData])

  // Memoized because it builds a UriTemplate: without this every keystroke
  // would re-parse the template just to render one line of preview.
  const expansion = useMemo(
    () => expandTemplate(template.uriTemplate, values),
    [template.uriTemplate, values]
  )

  // Clicking a History entry re-fills the form with that read's values. State is
  // adjusted during render off the prefill nonce (React's "store previous prop"
  // pattern). Only `formData` is touched, so Raw JSON mode stays as it was and
  // nothing executes.
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

  // Gated on the expansion, not just on schema validity. JSON Schema `required`
  // only asks whether a key is present, so a field the user typed into and then
  // cleared reads as valid while expandTemplate still refuses it — without this
  // the button would be live for a read that cannot happen.
  const executeDisabled = running || (mode === 'json' ? !jsonValid : !formValid) || !expansion.ok

  const statusHint = isEmpty
    ? 'Ready'
    : mode === 'json'
      ? jsonValid
        ? 'Ready'
        : 'Invalid JSON'
      : requiredSummary(rjsfSchema, formData)

  function handleExecute(): void {
    if (executeDisabled) return
    onExecute(values)
  }

  const tabItems: TabItem<TemplateRequestTab>[] = TABS

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
        label: 'Read',
        busyLabel: 'Reading…',
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
              <p className="text-sm text-text-muted">This template has no variables.</p>
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

          {/* What the values above actually resolve to. A template's whole point
              is that the URI is assembled rather than given, so showing the
              result as it's typed is what makes the form legible — and it's
              where percent-encoding becomes visible before a read, not after. */}
          <div className="flex flex-col gap-1 border-t border-border-soft pt-3">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-faint">
              Will read
            </span>
            <code
              data-testid="expanded-uri"
              className={`font-mono text-[13px] break-all ${
                expansion.ok ? 'text-text-primary' : 'text-fg-faint'
              }`}
            >
              {expansion.ok ? expansion.uri : template.uriTemplate}
            </code>
            {!expansion.ok && (
              <span className="text-[11.5px] text-text-muted">{expansion.error}</span>
            )}
          </div>
        </div>
      )}
    </RequestPanel>
  )
}
