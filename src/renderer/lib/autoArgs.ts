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

// Best-effort args for a server-level "run all tests" pass: seed schema
// defaults the same way the Params form does, then report whether every
// required field ended up filled.
export function autoToolArgs(tool: Tool): AutoArgsResult {
  const schema = tool.inputSchema as RJSFSchema
  const seeded = seedToolDefaults(schema)
  const required = Array.isArray(schema.required) ? schema.required : []
  const ok = required.every((key) => !isUnset(seeded[key]))
  return { ok, args: seeded }
}

// A prompt argument is a plain { name, required? } pair — no schema, no
// default value concept. Any required argument can't be auto-filled, so the
// whole prompt is skipped rather than guessed at.
export function autoPromptArgs(prompt: Prompt): AutoArgsResult {
  const hasRequired = (prompt.arguments ?? []).some((a) => a.required)
  return hasRequired ? { ok: false, args: {} } : { ok: true, args: {} }
}
