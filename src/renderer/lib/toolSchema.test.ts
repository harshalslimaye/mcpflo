import { describe, it, expect } from 'vitest'
import {
  analyzeSchema,
  assembleParams,
  buildZodSchema,
  initialFormValues,
  jsonToValues,
  valuesToJson,
  type PrimitiveField
} from './toolSchema'
import type { ToolInputSchema } from '../../shared/mcp.types'

const primitiveSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search text' },
    limit: { type: 'integer' },
    ratio: { type: 'number' },
    verbose: { type: 'boolean' },
    mode: { enum: ['fast', 'slow'] }
  },
  required: ['query']
}

describe('analyzeSchema', () => {
  it('flags a schema with no properties as empty', () => {
    const result = analyzeSchema({ type: 'object' })
    expect(result.isEmpty).toBe(true)
    expect(result.fields).toHaveLength(0)
    expect(result.hasNonPrimitive).toBe(false)
  })

  it('extracts each primitive kind', () => {
    const { fields } = analyzeSchema(primitiveSchema)
    const byName = Object.fromEntries(fields.map((f) => [f.name, f.kind]))
    expect(byName).toEqual({
      query: 'string',
      limit: 'integer',
      ratio: 'number',
      verbose: 'boolean',
      mode: 'enum'
    })
  })

  it('marks required fields from the required array', () => {
    const { fields } = analyzeSchema(primitiveSchema)
    expect(fields.find((f) => f.name === 'query')?.required).toBe(true)
    expect(fields.find((f) => f.name === 'limit')?.required).toBe(false)
  })

  it('captures descriptions when present', () => {
    const { fields } = analyzeSchema(primitiveSchema)
    expect(fields.find((f) => f.name === 'query')?.description).toBe('Search text')
    expect(fields.find((f) => f.name === 'limit')?.description).toBeUndefined()
  })

  it('reads enum values and detects numeric enums', () => {
    const { fields } = analyzeSchema({
      type: 'object',
      properties: { level: { enum: [1, 2, 3] } }
    })
    const level = fields[0]
    expect(level.enumValues).toEqual([1, 2, 3])
    expect(level.enumIsNumeric).toBe(true)
  })

  it('flags object/array properties as non-primitive and omits them from fields', () => {
    const { fields, hasNonPrimitive } = analyzeSchema({
      type: 'object',
      properties: {
        name: { type: 'string' },
        filters: { type: 'object', properties: {} },
        tags: { type: 'array' }
      }
    })
    expect(hasNonPrimitive).toBe(true)
    expect(fields.map((f) => f.name)).toEqual(['name'])
  })

  it('treats an array-of-types union as non-primitive', () => {
    const { hasNonPrimitive, fields } = analyzeSchema({
      type: 'object',
      properties: { maybe: { type: ['string', 'null'] } }
    })
    expect(hasNonPrimitive).toBe(true)
    expect(fields).toHaveLength(0)
  })
})

describe('buildZodSchema', () => {
  it('validates a well-formed params object', () => {
    const { fields } = analyzeSchema(primitiveSchema)
    const schema = buildZodSchema(fields)
    const result = schema.safeParse({
      query: 'hi',
      limit: 5,
      ratio: 1.5,
      verbose: true,
      mode: 'fast'
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing required field', () => {
    const { fields } = analyzeSchema(primitiveSchema)
    const schema = buildZodSchema(fields)
    expect(schema.safeParse({ verbose: false }).success).toBe(false)
  })

  it('rejects an out-of-range enum value', () => {
    const { fields } = analyzeSchema(primitiveSchema)
    const schema = buildZodSchema(fields)
    expect(schema.safeParse({ query: 'x', mode: 'nope' }).success).toBe(false)
  })
})

describe('assembleParams', () => {
  const fields = analyzeSchema(primitiveSchema).fields

  it('coerces raw form values into typed params', () => {
    const { params, errors } = assembleParams(fields, {
      query: 'cats',
      limit: '5',
      ratio: '0.5',
      verbose: true,
      mode: 'slow'
    })
    expect(errors).toEqual({})
    expect(params).toEqual({ query: 'cats', limit: 5, ratio: 0.5, verbose: true, mode: 'slow' })
  })

  it('reports an error for a required field left empty', () => {
    const { errors } = assembleParams(fields, initialFormValues(fields))
    expect(errors.query).toMatch(/required/i)
  })

  it('omits optional empty fields from params', () => {
    const { params, errors } = assembleParams(fields, { ...initialFormValues(fields), query: 'x' })
    expect(errors).toEqual({})
    expect(params).toEqual({ query: 'x', verbose: false })
    expect('limit' in params).toBe(false)
  })

  it('reports an error for a non-numeric number field', () => {
    const { errors } = assembleParams(fields, {
      ...initialFormValues(fields),
      query: 'x',
      ratio: 'abc'
    })
    expect(errors.ratio).toMatch(/number/i)
  })

  it('reports an error for a non-integer integer field', () => {
    const { errors } = assembleParams(fields, {
      ...initialFormValues(fields),
      query: 'x',
      limit: '2.5'
    })
    expect(errors.limit).toBeDefined()
  })

  it('coerces numeric enums to numbers', () => {
    const numericEnum: PrimitiveField[] = analyzeSchema({
      type: 'object',
      properties: { level: { enum: [1, 2, 3] } }
    }).fields
    const { params } = assembleParams(numericEnum, { level: '2' })
    expect(params.level).toBe(2)
  })
})

describe('valuesToJson / jsonToValues round-trip', () => {
  const fields = analyzeSchema(primitiveSchema).fields

  it('serializes set values and omits empty optional ones', () => {
    const json = valuesToJson(fields, { ...initialFormValues(fields), query: 'cats', limit: '3' })
    const parsed = JSON.parse(json)
    expect(parsed).toEqual({ query: 'cats', limit: 3, verbose: false })
  })

  it('maps a parsed object back onto raw form values', () => {
    const values = jsonToValues(fields, { query: 'dogs', limit: 7, verbose: true, mode: 'fast' })
    expect(values.query).toBe('dogs')
    expect(values.limit).toBe('7')
    expect(values.verbose).toBe(true)
    expect(values.mode).toBe('fast')
  })

  it('ignores unknown keys when mapping back', () => {
    const values = jsonToValues(fields, { query: 'x', unknownKey: 'ignored' })
    expect('unknownKey' in values).toBe(false)
  })
})
