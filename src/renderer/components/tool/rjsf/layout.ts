import type { RJSFSchema, UiSchema } from '@rjsf/utils'

// The form layout engine. Pure, schema-only logic that decides how an object's
// properties are ordered and sized in the two-column Request grid. It produces a
// plan; `ObjectFieldTemplate` renders RJSF's already-built field content into it.
//
// The pipeline (see the redesign spec): classify each property → order
// (required scalars → optional scalars → full-width scalars → textareas →
// arrays/objects, booleans pulled into a trailing band) → decide single-column
// vs grid. Anything we can't confidently classify degrades to a full-width cell
// so an unusual schema renders plainly rather than breaking the grid.

export type CellWidth = 'half' | 'full'

export interface LayoutCell {
  name: string
  width: CellWidth
}

export interface LayoutPlan {
  // True when a grid would just leave empty cells (≤3 fields, or fewer than two
  // pairable half-width fields). Everything stacks full-width instead.
  singleColumn: boolean
  // Ordered, non-boolean fields with their grid width.
  cells: LayoutCell[]
  // Boolean field names, in declared order, for the trailing switch band.
  booleans: string[]
}

type SubSchema = RJSFSchema | boolean

// A field's layout kind. `scalar-half` flows two-up; everything else takes its
// own row.
type Kind = 'boolean' | 'array' | 'object' | 'textarea' | 'scalar-full' | 'scalar-half' | 'unknown'

// Property-name tokens that signal prose worth a textarea. Deliberately narrow —
// a false positive only makes a short input resizable, but we still avoid the
// truly generic words (`text`, `name`) that are usually single-line.
const PROSE_RE =
  /(notes?|description|body|content|message|comment|prompt|instructions?|summary|details)/i

function typeOf(schema: RJSFSchema): string | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== 'null')
  return typeof schema.type === 'string' ? schema.type : undefined
}

// A string that should render as a multi-line textarea (full-width row).
export function isMultilineString(schema: RJSFSchema, name: string): boolean {
  if (typeOf(schema) !== 'string' || schema.enum) return false
  if (schema.format === 'uri' || schema.format === 'uri-reference') return false
  if (schema.format === 'textarea') return true
  // A small explicit cap means the value is short — never a textarea.
  if (typeof schema.maxLength === 'number' && schema.maxLength <= 120) return false
  return PROSE_RE.test(name)
}

// A single-line string whose value is long/unbreakable (URI, path, token) and so
// shouldn't be squeezed into a half-width cell.
function isLongString(schema: RJSFSchema): boolean {
  if (typeOf(schema) !== 'string' || schema.enum) return false
  if (schema.format === 'uri' || schema.format === 'uri-reference') return true
  return typeof schema.maxLength === 'number' && schema.maxLength > 120
}

function classifyKind(sub: SubSchema, name: string): Kind {
  // Boolean/untyped schemas (`true`, `{}`, `{ description }`) carry nothing to
  // size on — full-width, and RJSF's JsonField handles the input.
  if (sub === true || sub === false || typeof sub !== 'object' || sub === null) return 'unknown'
  const t = typeOf(sub)
  if (t === 'boolean') return 'boolean'
  if (t === 'array') return 'array'
  if (t === 'object') return 'object'
  if (sub.enum) return 'scalar-half'
  if (t === 'string') {
    if (isMultilineString(sub, name)) return 'textarea'
    if (isLongString(sub)) return 'scalar-full'
    return 'scalar-half'
  }
  if (t === 'number' || t === 'integer') return 'scalar-half'
  return 'unknown'
}

function widthOf(kind: Kind): CellWidth {
  return kind === 'scalar-half' ? 'half' : 'full'
}

// Ordering bucket. Lower sorts earlier. Within a bucket, required fields lead and
// declared order is preserved (stable sort). Booleans are handled separately.
function bucket(kind: Kind): number {
  switch (kind) {
    case 'scalar-half':
      return 0
    case 'scalar-full':
      return 1
    case 'textarea':
      return 2
    default:
      // arrays, objects, and the unknown fallback are all full-width blocks.
      return 3
  }
}

export function planLayout(schema: RJSFSchema): LayoutPlan {
  const props = (schema.properties ?? {}) as Record<string, SubSchema>
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  const names = Object.keys(props)

  const entries = names.map((name, idx) => ({
    name,
    idx,
    required: required.has(name),
    kind: classifyKind(props[name], name)
  }))

  const booleans = entries.filter((e) => e.kind === 'boolean').map((e) => e.name)

  const ordered = entries
    .filter((e) => e.kind !== 'boolean')
    .sort((a, b) => {
      const byBucket = bucket(a.kind) - bucket(b.kind)
      if (byBucket !== 0) return byBucket
      const byRequired = Number(b.required) - Number(a.required)
      if (byRequired !== 0) return byRequired
      return a.idx - b.idx
    })

  const cells: LayoutCell[] = ordered.map((e) => ({ name: e.name, width: widthOf(e.kind) }))

  // A grid only earns its keep when at least two fields can pair; otherwise it
  // just opens empty cells. Full-width fields (textareas, arrays, objects) take
  // their own row and don't count toward pairing — so the same rule applies at
  // every level, including inside array-item cards.
  const halfCount = cells.filter((c) => c.width === 'half').length
  const singleColumn = halfCount < 2

  return { singleColumn, cells, booleans }
}

// Builds the uiSchema that drives multi-line detection: any string the engine
// classifies as prose gets RJSF's textarea widget. Recurses into nested objects
// and array items so the rule applies at every depth.
export function buildUiSchema(schema: SubSchema): UiSchema {
  if (typeof schema !== 'object' || schema === null) return {}
  const ui: UiSchema = {}
  const t = typeOf(schema)

  if (t === 'object' && schema.properties) {
    for (const [name, sub] of Object.entries(schema.properties as Record<string, SubSchema>)) {
      if (typeof sub !== 'object' || sub === null) continue
      if (isMultilineString(sub, name)) {
        ui[name] = { 'ui:widget': 'textarea' }
      } else {
        const child = buildUiSchema(sub)
        if (Object.keys(child).length > 0) ui[name] = child
      }
    }
  } else if (
    t === 'array' &&
    schema.items &&
    typeof schema.items === 'object' &&
    !Array.isArray(schema.items)
  ) {
    const child = buildUiSchema(schema.items as SubSchema)
    if (Object.keys(child).length > 0) ui.items = child
  }

  return ui
}
