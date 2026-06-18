import { describe, it, expect } from 'vitest'
import type { RJSFSchema } from '@rjsf/utils'
import { requiredSummary } from './formStatus'

const schema: RJSFSchema = {
  type: 'object',
  properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } },
  required: ['a', 'b']
}

describe('requiredSummary', () => {
  it('counts required fields and how many are unset', () => {
    expect(requiredSummary(schema, {})).toBe('2 required · 2 missing')
    expect(requiredSummary(schema, { a: 'x' })).toBe('2 required · 1 missing')
    expect(requiredSummary(schema, { a: 'x', b: 'y' })).toBe('2 required · 0 missing')
  })

  it('treats empty strings and empty arrays as unset', () => {
    const s: RJSFSchema = { type: 'object', properties: {}, required: ['a', 'b'] }
    expect(requiredSummary(s, { a: '', b: [] })).toBe('2 required · 2 missing')
  })

  it('returns Ready when nothing is required', () => {
    expect(requiredSummary({ type: 'object', properties: {} }, {})).toBe('Ready')
  })
})
