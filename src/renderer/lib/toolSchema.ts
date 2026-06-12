import { z } from 'zod'
import type { ToolInputSchema } from '../../shared/mcp.types'

// ── Schema analysis ────────────────────────────────────────────────────────
//
// The Params form is driven by a tool's JSON Schema, but it only renders
// *top-level primitive* properties (string / number / integer / boolean /
// enum). Anything richer (nested objects, arrays, unions, untyped) is flagged
// so the view can fall back to raw-JSON editing.

export type FieldKind = 'string' | 'number' | 'integer' | 'boolean' | 'enum'

export interface PrimitiveField {
  name: string
  kind: FieldKind
  // Human-readable label; the form falls back to `name` when absent.
  title?: string
  description?: string
  required: boolean
  // For enum fields: the allowed values and whether they are numeric.
  enumValues?: Array<string | number>
  enumIsNumeric?: boolean
  // Schema-declared default, used to seed the form.
  defaultValue?: unknown
}

export interface SchemaAnalysis {
  fields: PrimitiveField[]
  // True when at least one top-level property is non-primitive (object/array/…).
  hasNonPrimitive: boolean
  // True when the schema declares no properties at all.
  isEmpty: boolean
}

// The opaque per-property shape we actually read from a JSON Schema.
interface JsonSchemaProp {
  type?: string | string[]
  enum?: Array<string | number | boolean | null>
  title?: string
  description?: string
  default?: unknown
}

function classify(prop: JsonSchemaProp): FieldKind | null {
  // Enums map to a select regardless of their declared type, as long as the
  // values are primitives we can render as options.
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    const allRenderable = prop.enum.every((v) => typeof v === 'string' || typeof v === 'number')
    return allRenderable ? 'enum' : null
  }
  switch (prop.type) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'integer':
      return 'integer'
    case 'boolean':
      return 'boolean'
    default:
      // object, array, an array-of-types union, or no type → non-primitive.
      return null
  }
}

export function analyzeSchema(schema: ToolInputSchema | undefined): SchemaAnalysis {
  const properties = (schema?.properties ?? {}) as Record<string, JsonSchemaProp>
  const requiredList = Array.isArray(schema?.required) ? schema.required : []
  const names = Object.keys(properties)

  if (names.length === 0) {
    return { fields: [], hasNonPrimitive: false, isEmpty: true }
  }

  const fields: PrimitiveField[] = []
  let hasNonPrimitive = false

  for (const name of names) {
    const prop = properties[name] ?? {}
    const kind = classify(prop)
    if (kind === null) {
      hasNonPrimitive = true
      continue
    }

    const enumValues =
      kind === 'enum'
        ? (prop.enum as Array<string | number>).filter(
            (v) => typeof v === 'string' || typeof v === 'number'
          )
        : undefined

    fields.push({
      name,
      kind,
      title: typeof prop.title === 'string' ? prop.title : undefined,
      description: typeof prop.description === 'string' ? prop.description : undefined,
      required: requiredList.includes(name),
      enumValues,
      enumIsNumeric: enumValues ? enumValues.every((v) => typeof v === 'number') : undefined,
      defaultValue: prop.default
    })
  }

  return { fields, hasNonPrimitive, isEmpty: false }
}

// ── Zod derivation ───────────────────────────────────────────────────────────

function fieldSchema(field: PrimitiveField): z.ZodTypeAny {
  let base: z.ZodTypeAny
  switch (field.kind) {
    case 'string':
      base = z.string()
      break
    case 'number':
      base = z.number()
      break
    case 'integer':
      base = z.number().int()
      break
    case 'boolean':
      base = z.boolean()
      break
    case 'enum': {
      const values = field.enumValues ?? []
      if (values.length === 1) {
        base = z.literal(values[0])
      } else {
        const literals = values.map((v) => z.literal(v))
        base = z.union(
          literals as unknown as readonly [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]
        )
      }
      break
    }
  }
  return field.required ? base : base.optional()
}

export function buildZodSchema(fields: PrimitiveField[]): z.ZodObject {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    shape[field.name] = fieldSchema(field)
  }
  return z.object(shape)
}

// ── Form values ⇄ typed params ───────────────────────────────────────────────
//
// Form inputs are kept as raw values (strings for text/number/enum, booleans
// for toggles). `FormValues` is that raw bag; `assembleParams` coerces it into
// the typed object an MCP call would receive.

export type FormValue = string | boolean
export type FormValues = Record<string, FormValue>

export function initialFormValues(fields: PrimitiveField[]): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    const def = field.defaultValue
    if (field.kind === 'boolean') {
      values[field.name] = typeof def === 'boolean' ? def : false
    } else {
      values[field.name] = typeof def === 'string' || typeof def === 'number' ? String(def) : ''
    }
  }
  return values
}

function isUnset(value: FormValue): boolean {
  return value === '' || value === undefined
}

// Best-effort coercion of a single raw value to its typed form. Used both for
// building the params payload and for serializing the form into JSON.
function coerce(field: PrimitiveField, raw: FormValue): unknown {
  switch (field.kind) {
    case 'boolean':
      return Boolean(raw)
    case 'number':
    case 'integer': {
      const n = Number(raw)
      return Number.isNaN(n) ? raw : n
    }
    case 'enum':
      return field.enumIsNumeric ? Number(raw) : raw
    case 'string':
    default:
      return raw
  }
}

export interface AssembleResult {
  params: Record<string, unknown>
  errors: Record<string, string>
}

// Coerce + validate the form. Required-but-empty fields and type mismatches
// surface as per-field error messages; everything else lands in `params`.
export function assembleParams(fields: PrimitiveField[], values: FormValues): AssembleResult {
  const params: Record<string, unknown> = {}
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const raw = values[field.name]

    if (field.kind === 'boolean') {
      params[field.name] = Boolean(raw)
      continue
    }

    if (isUnset(raw)) {
      if (field.required) errors[field.name] = `${field.name} is required`
      continue
    }

    const typed = coerce(field, raw)
    const result = fieldSchema(field).safeParse(typed)
    if (result.success) {
      params[field.name] = typed
    } else {
      errors[field.name] = friendlyMessage(field, result.error)
    }
  }

  return { params, errors }
}

function friendlyMessage(field: PrimitiveField, error: z.ZodError): string {
  switch (field.kind) {
    case 'number':
      return 'Must be a number'
    case 'integer':
      return 'Must be a whole number'
    case 'enum':
      return `Must be one of: ${(field.enumValues ?? []).join(', ')}`
    default:
      return error.issues[0]?.message ?? 'Invalid value'
  }
}

// Serialize the current form into raw values for the JSON textarea. Unlike
// `assembleParams` this never errors — it includes whatever the user has typed.
export function valuesToJson(fields: PrimitiveField[], values: FormValues): string {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = values[field.name]
    if (field.kind === 'boolean') {
      out[field.name] = Boolean(raw)
    } else if (!isUnset(raw)) {
      out[field.name] = coerce(field, raw)
    }
  }
  return JSON.stringify(out, null, 2)
}

// Map a parsed JSON object back onto raw form values (for the JSON → form
// switch). Only keys matching known fields are applied.
export function jsonToValues(
  fields: PrimitiveField[],
  parsed: Record<string, unknown>
): FormValues {
  const values = initialFormValues(fields)
  for (const field of fields) {
    if (!(field.name in parsed)) continue
    const value = parsed[field.name]
    if (field.kind === 'boolean') {
      values[field.name] = Boolean(value)
    } else if (value !== null && value !== undefined) {
      values[field.name] = String(value)
    }
  }
  return values
}
