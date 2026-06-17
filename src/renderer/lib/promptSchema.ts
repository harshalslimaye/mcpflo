import type { Prompt, ToolInputSchema } from '../../shared/mcp.types'

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
