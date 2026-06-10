import { useMemo, useState } from 'react'
import type { Tool } from '../../../shared/mcp.types'
import { Toggle } from '../ui/Toggle'
import { ToolCallResultView } from './ToolCallResultView'
import { useServerStore, toolKey } from '../../stores/serverStore'
import {
  analyzeSchema,
  assembleParams,
  initialFormValues,
  jsonToValues,
  valuesToJson,
  type FormValues,
  type PrimitiveField
} from '../../lib/toolSchema'

interface ParamsTabProps {
  tool: Tool
  serverId: string
}

type Mode = 'form' | 'json'

function parseJsonObject(text: string):
  | { ok: true; value: Record<string, unknown> }
  | {
      ok: false
      error: string
    } {
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

export function ParamsTab({ tool, serverId }: ParamsTabProps): React.JSX.Element {
  const analysis = useMemo(() => analyzeSchema(tool.inputSchema), [tool.inputSchema])
  const { fields, hasNonPrimitive, isEmpty } = analysis

  const executeTool = useServerStore((s) => s.executeTool)
  const latestCall = useServerStore((s) => s.history[toolKey(serverId, tool.name)]?.[0])
  const [running, setRunning] = useState(false)

  // Schemas with non-primitive properties can't be represented by the form, so
  // they open in (and are locked to) raw-JSON mode.
  const [mode, setMode] = useState<Mode>(hasNonPrimitive ? 'json' : 'form')
  const [values, setValues] = useState<FormValues>(() => initialFormValues(fields))
  const [jsonText, setJsonText] = useState<string>(() =>
    valuesToJson(fields, initialFormValues(fields))
  )
  const [switchError, setSwitchError] = useState<string | null>(null)

  const { params, errors } = useMemo(() => assembleParams(fields, values), [fields, values])
  const formValid = Object.keys(errors).length === 0

  const jsonParse = useMemo(() => parseJsonObject(jsonText), [jsonText])
  const jsonValid = jsonParse.ok

  function setField(name: string, value: FormValues[string]): void {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  function handleToggleMode(toJson: boolean): void {
    setSwitchError(null)
    if (toJson) {
      // form → json: serialize the current form values.
      setJsonText(valuesToJson(fields, values))
      setMode('json')
      return
    }
    // json → form: only switch if the JSON parses to an object; otherwise block.
    const result = parseJsonObject(jsonText)
    if (!result.ok) {
      setSwitchError(result.error)
      return
    }
    setValues(jsonToValues(fields, result.value))
    setMode('form')
  }

  async function handleExecute(): Promise<void> {
    const payload = mode === 'json' ? (jsonParse.ok ? jsonParse.value : {}) : params
    setRunning(true)
    try {
      await executeTool(serverId, tool.name, payload)
    } finally {
      setRunning(false)
    }
  }

  const executeDisabled = running || (mode === 'json' ? !jsonValid : !formValid)

  return (
    // Constrain the form (and the Execute button it contains) to a readable
    // column, left-aligned within the content area.
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* Raw JSON switch — hidden when there are no parameters at all. */}
      {!isEmpty && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Toggle
              checked={mode === 'json'}
              onChange={handleToggleMode}
              aria-label="Edit as raw JSON"
              disabled={hasNonPrimitive}
            />
            <span className="text-xs text-text-muted">Raw JSON</span>
          </div>
          {hasNonPrimitive && (
            <span className="text-xs text-text-muted opacity-70">
              This tool has complex parameters — edit as JSON
            </span>
          )}
        </div>
      )}

      {switchError && <p className="text-xs text-red-400">{switchError}</p>}

      {mode === 'form' ? (
        isEmpty ? (
          <p className="text-text-muted text-sm">This tool takes no parameters.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {fields.map((field) => (
              <FieldRow key={field.name} field={field}>
                <FieldInput
                  field={field}
                  value={values[field.name]}
                  onChange={(v) => setField(field.name, v)}
                />
                {errors[field.name] && <p className="text-xs text-red-400">{errors[field.name]}</p>}
              </FieldRow>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-1">
          <textarea
            aria-label="Params JSON"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={12}
            spellCheck={false}
            className="w-full px-3 py-2 rounded border border-border bg-bg-elevated text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-y font-mono"
          />
          {!jsonValid && <p className="text-xs text-red-400">{jsonParse.error}</p>}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleExecute}
          disabled={executeDisabled}
          className="px-4 py-1.5 rounded text-sm bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? 'Executing…' : 'Execute'}
        </button>
      </div>

      {/* Result of the most recent call for this tool. */}
      {(running || latestCall) && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-xs text-text-muted uppercase tracking-wider font-medium">
            Result
          </span>
          {running ? (
            <span className="text-text-muted text-sm">Executing…</span>
          ) : (
            latestCall && <ToolCallResultView record={latestCall} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Field primitives ─────────────────────────────────────────────────────────

function FieldRow({
  field,
  children
}: {
  field: PrimitiveField
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-text-muted font-mono">
        {field.name}
        {field.required && <span className="text-accent ml-0.5">*</span>}
      </label>
      {field.description && (
        <p className="text-xs text-text-muted opacity-70 leading-snug">{field.description}</p>
      )}
      {children}
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange
}: {
  field: PrimitiveField
  value: FormValues[string]
  onChange: (value: FormValues[string]) => void
}): React.JSX.Element {
  const inputClass =
    'w-full px-3 py-1.5 rounded border border-border bg-bg-elevated text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors'

  if (field.kind === 'boolean') {
    return <Toggle checked={value === true} onChange={onChange} aria-label={field.name} />
  }

  if (field.kind === 'enum') {
    return (
      <select
        aria-label={field.name}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        <option value="">{field.required ? 'Select…' : '(none)'}</option>
        {(field.enumValues ?? []).map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    )
  }

  if (field.kind === 'number' || field.kind === 'integer') {
    return (
      <input
        type="number"
        aria-label={field.name}
        value={String(value)}
        step={field.kind === 'integer' ? 1 : 'any'}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    )
  }

  return (
    <input
      type="text"
      aria-label={field.name}
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  )
}
