import type { UiSchema } from '@rjsf/utils'
import type { ResourceTemplate, ToolInputSchema } from '../../shared/mcp.types'
import { templateVariables } from './uriTemplate'

// A resource template declares its inputs as variables inside a URI, not as a
// JSON Schema. The Params form, validator and Raw-JSON toggle are all driven by
// JSON Schema (shared with the Tool and Prompt views), so we synthesize an
// equivalent object schema the same way buildPromptSchema does: one top-level
// `string` property per variable.
//
// Every variable is required. RFC 6570 can express optional ones, but a URI
// with an unfilled variable in it isn't a resource anyone asked to read — see
// expandTemplate, which refuses the same case for the same reason.
export function buildResourceTemplateSchema(template: ResourceTemplate): ToolInputSchema {
  const names = templateVariables(template.uriTemplate)
  const properties: Record<string, object> = {}
  for (const name of names) {
    properties[name] = { type: 'string' }
  }
  return {
    type: 'object',
    properties,
    ...(names.length > 0 ? { required: names } : {})
  }
}

// A template with no variables (or one that doesn't parse) has no form to fill —
// its URI is already concrete and can be read as-is.
export function isResourceTemplateEmpty(template: ResourceTemplate): boolean {
  return templateVariables(template.uriTemplate).length === 0
}

// Every variable gets the completion typeahead when the server declares the
// capability, so the user can pick a real id instead of guessing one.
//
// Built directly rather than through buildUiSchema, which the Tool and Prompt
// forms use: that routes string fields through a prose heuristic that turns
// names like `content` or `message` into textareas. A template variable is a
// URI component whatever it's called — a newline typed into one just becomes
// %0A — so the heuristic doesn't apply here and would only mislead.
export function buildResourceTemplateUiSchema(
  template: ResourceTemplate,
  { completions }: { completions: boolean }
): UiSchema {
  if (!completions) return {}
  const ui: UiSchema = {}
  for (const name of templateVariables(template.uriTemplate)) {
    ui[name] = { 'ui:widget': 'CompletionWidget' }
  }
  return ui
}
