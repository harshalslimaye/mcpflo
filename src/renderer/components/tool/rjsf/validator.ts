import { customizeValidator } from '@rjsf/validator-ajv8'
import Ajv2020 from 'ajv/dist/2020'
import draft7MetaSchema from 'ajv/dist/refs/json-schema-draft-07.json'

// MCP servers ship tool schemas in *either* dialect: the official servers (memory,
// everything, …) emit draft-07 via zod-to-json-schema, while newer SDKs emit
// draft-2020-12. The validator must understand both, or schemas in the "other"
// dialect silently fail to compile — `isValid` then returns false with an *empty*
// error list, which wedges Execute with no visible reason.
//
// We build on the 2020 dialect (native 2020-12 support) and register the draft-07
// meta-schema so AJV picks the right dialect per schema's `$schema`.
//
// - `strict: false` tolerates the vendor schema quirks real servers ship (unknown
//   keywords, `format` on the wrong type, …) instead of throwing.
// - `validateFormats: false` treats `format` as an *annotation*, not an assertion.
//   We're a tool for *exercising* MCP servers, so a `format: "uri"`/`"date-time"`
//   mismatch must not block Execute (e.g. a `datetime-local` input emits
//   `2024-01-01T10:00`, which isn't RFC3339). `required` and `type` are enforced.
export const validator = customizeValidator({
  AjvClass: Ajv2020,
  additionalMetaSchemas: [draft7MetaSchema as object],
  ajvOptionsOverrides: { strict: false, validateFormats: false }
})
