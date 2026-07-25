import type { RJSFSchema, UiSchema } from '@rjsf/utils'
import type { Prompt, ToolInputSchema } from '../../shared/mcp.types'
import { buildUiSchema, isMultilineString } from '../components/tool/rjsf/layout'

// Prompts declare their inputs as a flat list of named arguments (name +
// optional description + required flag), not a JSON Schema. The Params form,
// validator and Raw-JSON toggle are all driven by JSON Schema (shared with the
// Tool view), so we synthesize an equivalent object schema: every argument
// becomes a top-level `string` property, with the required ones listed in
// `required`. The result drives RJSF and doubles as the read-only Schema tab.
export function buildPromptSchema(prompt: Prompt): ToolInputSchema {
  const args = prompt.arguments ?? []
  const properties: Record<string, object> = {}
  const required: string[] = []
  for (const arg of args) {
    properties[arg.name] = {
      type: 'string',
      ...(arg.description ? { description: arg.description } : {})
    }
    if (arg.required) required.push(arg.name)
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {})
  }
}

// A prompt with no declared arguments has no form to fill.
export function isPromptEmpty(prompt: Prompt): boolean {
  return (prompt.arguments ?? []).length === 0
}

// Extends buildUiSchema with the completion typeahead: when the server
// declares the `completions` capability, every single-line string argument
// gets the combobox widget. Every synthesized prompt property is already a
// plain string (buildPromptSchema never nests), so this only needs to skip
// the ones buildUiSchema already turned into a textarea — a prose field
// keeps its textarea rather than gaining a typeahead (D10 in the completion
// plan): the two widgets aren't meant to combine.
export function buildPromptUiSchema(
  prompt: Prompt,
  { completions }: { completions: boolean }
): UiSchema {
  const schema = buildPromptSchema(prompt) as RJSFSchema
  const ui = buildUiSchema(schema)
  if (!completions) return ui

  const properties = (schema.properties ?? {}) as Record<string, RJSFSchema>
  for (const [name, sub] of Object.entries(properties)) {
    if (isMultilineString(sub, name)) continue
    ui[name] = { 'ui:widget': 'CompletionWidget' }
  }
  return ui
}
