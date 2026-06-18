import type { RJSFSchema } from '@rjsf/utils'

// The footer hint summarizing how many top-level required fields are still
// unfilled, e.g. "4 required · 2 missing". A top-level summary by design — nested
// required properties surface as inline field errors, not in this count. Returns
// "Ready" when the object declares no required fields.
export function requiredSummary(schema: RJSFSchema, formData: Record<string, unknown>): string {
  const required = Array.isArray(schema.required) ? schema.required : []
  if (required.length === 0) return 'Ready'
  const missing = required.filter((key) => isUnset(formData[key])).length
  return `${required.length} required · ${missing} missing`
}

function isUnset(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  return false
}
