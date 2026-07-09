import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils'
import { validator } from '../components/tool/rjsf/validator'
import type { Tool, Prompt } from '../../shared/mcp.types'

function isUnset(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

// Seeds a tool's form data from its schema's declared defaults. Required
// booleans are seeded to `false`: a toggle always has a value, so an
// untouched required boolean would otherwise read as "missing". Shared by
// ToolRequestPanel's own form (a fresh, unedited form starts here) and
// autoToolArgs below (a Tests-tab bulk run has no form to seed from at all).
export function seedToolDefaults(schema: RJSFSchema): Record<string, unknown> {
  const seeded =
    (getDefaultFormState(validator, schema, {}, schema) as Record<string, unknown>) ?? {}
  const props = (schema.properties ?? {}) as Record<string, { type?: unknown }>
  for (const key of Array.isArray(schema.required) ? schema.required : []) {
    if (props[key]?.type === 'boolean' && seeded[key] === undefined) seeded[key] = false
  }
  return seeded
}

export interface AutoArgsResult {
  // False means at least one required field has no derivable default — the
  // caller should mark this capability "skipped, needs input" rather than
  // invoke it with guessed args.
  ok: boolean
  args: Record<string, unknown>
}

// Args for a server-level "run all tests" pass. `testArgs` is a single
// capability's marked Saved Request (its `.args`), or `null` when none is
// marked — there is no other fallback (e.g. no last-executed-args cache):
// schema defaults, overridden by the marked request when one exists, then a
// required-fields check decides `ok`.
export function resolveToolArgs(
  tool: Tool,
  testArgs: Record<string, unknown> | null
): AutoArgsResult {
  const schema = tool.inputSchema as RJSFSchema
  const seeded = seedToolDefaults(schema)
  // The marked request wins per key; schema defaults still fill in anything
  // it doesn't cover (e.g. a field the schema gained after the request was
  // saved).
  const merged = testArgs ? { ...seeded, ...testArgs } : seeded
  const required = Array.isArray(schema.required) ? schema.required : []
  const ok = required.every((key) => !isUnset(merged[key]))
  return { ok, args: merged }
}

// A prompt argument is a plain { name, required? } pair — no schema, no
// default value concept, so there's nothing to seed the way tool args are.
// `testArgs` (a marked Saved Request's raw args) is filtered to string-valued
// entries only, since prompts/get needs Record<string, string> on the wire.
// `null` reduces to: ok only when the prompt has no required arguments at
// all, since none can be auto-filled without a marked request.
export function resolvePromptArgs(
  prompt: Prompt,
  testArgs: Record<string, unknown> | null
): AutoArgsResult {
  const stringArgs: Record<string, unknown> = {}
  if (testArgs) {
    for (const [key, value] of Object.entries(testArgs)) {
      if (typeof value === 'string' && value !== '') stringArgs[key] = value
    }
  }
  const required = (prompt.arguments ?? []).filter((a) => a.required).map((a) => a.name)
  const ok = required.every((name) => typeof stringArgs[name] === 'string')
  return { ok, args: stringArgs }
}
