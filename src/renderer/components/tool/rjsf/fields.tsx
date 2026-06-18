import { useState } from 'react'
import { getDefaultRegistry } from '@rjsf/core'
import type { FieldPathList, FieldProps, RegistryFieldsType, RJSFSchema } from '@rjsf/utils'
import { HelpIcon } from './HelpIcon'
import { readTouched } from './touched'

// How many object/array container levels deep we recurse before falling back to
// a JSON editor. Keeps the worked examples (array-of-objects with a nested
// array, ~2–3 levels) rendering as real forms while guarding against runaway or
// self-referential schemas.
const MAX_CONTAINER_DEPTH = 3

// Counts the object/array nesting depth of a field path, ignoring array indices
// (numeric segments) so a long array doesn't read as deep nesting.
export function containerDepth(path: FieldPathList): number {
  return path.filter((seg) => typeof seg !== 'number').length
}

// RJSF can't pick a widget for a schema with no resolvable type (e.g. `{}`, a
// `true` schema, or `{ description: '…' }`), so it renders *nothing* — leaving a
// required "any"-typed property impossible to fill and the form permanently
// invalid. MCP servers commonly expose such free-form params (`data`,
// `arguments`, …). We intercept those and render a JSON editor instead.

const { SchemaField: DefaultSchemaField } = getDefaultRegistry().fields

const JSON_CLASS =
  'w-full resize-y rounded-[8px] border border-border bg-bg-elevated px-[13px] py-[11px] font-mono text-[13.5px] text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent-line focus:ring-[3px] focus:ring-accent-soft'

// True when the schema constrains nothing we can map to a typed widget.
function isUntyped(schema: RJSFSchema | boolean): boolean {
  if (schema === true) return true
  if (!schema || typeof schema !== 'object') return false
  const structural = [
    'type',
    'enum',
    'const',
    '$ref',
    'anyOf',
    'oneOf',
    'allOf',
    'properties',
    'items',
    'additionalProperties',
    'patternProperties'
  ]
  return !structural.some((k) => k in schema)
}

// A free-form value editor: the field accepts any JSON. Empty → the value is
// unset (so `required` still bites); invalid JSON is held locally and not
// propagated, so the form stays invalid until it parses.
function JsonField(props: FieldProps): React.JSX.Element {
  const { schema, fieldPathId, formData, onChange, required, name, rawErrors, registry } = props
  const id = fieldPathId.$id
  const ctx = readTouched(registry.formContext)
  const showErrors = !ctx || ctx.touched.has(id)
  const label = (typeof schema.title === 'string' && schema.title) || name
  const [text, setText] = useState(() =>
    formData === undefined ? '' : JSON.stringify(formData, null, 2)
  )
  const [parseError, setParseError] = useState<string | null>(null)

  function handle(value: string): void {
    setText(value)
    if (value.trim() === '') {
      setParseError(null)
      onChange(undefined, fieldPathId.path)
      return
    }
    try {
      const parsed = JSON.parse(value)
      setParseError(null)
      onChange(parsed, fieldPathId.path)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="font-mono text-[13px] text-text-primary">
          {label}
          {required && <span className="ml-0.5 text-accent">*</span>}
        </label>
        <HelpIcon text={'Free-form value — enter JSON (e.g. "text", 42, { "k": "v" })'} />
      </div>
      <textarea
        id={id}
        aria-label={label}
        value={text}
        rows={3}
        spellCheck={false}
        className={JSON_CLASS}
        onChange={(e) => handle(e.target.value)}
        onBlur={() => ctx?.markTouched(id)}
      />
      {parseError && <p className="text-xs text-red-400">{parseError}</p>}
      {showErrors &&
        Array.isArray(rawErrors) &&
        rawErrors.map((error) => (
          <p key={error} className="text-xs text-red-400">
            {error}
          </p>
        ))}
    </div>
  )
}

// SchemaField is RJSF's per-field dispatcher. We render a JSON editor for
// untyped schemas, and also for object/array containers nested past the depth
// cap — that both tames very deep forms and stops recursion on self-referential
// schemas. Everything else delegates to the default.
function SchemaField(props: FieldProps): React.JSX.Element {
  if (isUntyped(props.schema)) return <JsonField {...props} />
  const type = props.schema.type
  const isContainer = type === 'object' || type === 'array'
  if (isContainer && containerDepth(props.fieldPathId.path) > MAX_CONTAINER_DEPTH) {
    return <JsonField {...props} />
  }
  return <DefaultSchemaField {...props} />
}

export const fields: RegistryFieldsType = { SchemaField }
