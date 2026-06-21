import { describe, it, expect } from 'vitest'
import { expandEmbeddedJson } from './expandEmbeddedJson'

describe('expandEmbeddedJson', () => {
  it('parses a string that encodes a JSON object', () => {
    expect(expandEmbeddedJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses a string that encodes a JSON array', () => {
    expect(expandEmbeddedJson('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('expands embedded JSON nested inside object values', () => {
    const input = { content: [{ type: 'text', text: '{"city":"Paris"}' }] }
    expect(expandEmbeddedJson(input)).toEqual({
      content: [{ type: 'text', text: { city: 'Paris' } }]
    })
  })

  it('expands JSON strings nested inside an already-embedded payload', () => {
    // The outer text is JSON; one of its fields is itself a JSON string.
    expect(expandEmbeddedJson('{"inner":"{\\"a\\":1}"}')).toEqual({ inner: { a: 1 } })
  })

  it('leaves plain text untouched', () => {
    expect(expandEmbeddedJson('Echo: HELLO')).toBe('Echo: HELLO')
  })

  it('does not expand bare scalars even when they are valid JSON', () => {
    // Numbers/quoted strings parse, but only object/array roots are expanded.
    expect(expandEmbeddedJson('42')).toBe('42')
    expect(expandEmbeddedJson('"hello"')).toBe('"hello"')
    expect(expandEmbeddedJson('true')).toBe('true')
  })

  it('leaves malformed JSON-looking strings as-is', () => {
    expect(expandEmbeddedJson('{not valid')).toBe('{not valid')
  })

  it('passes non-string scalars through unchanged', () => {
    expect(expandEmbeddedJson(7)).toBe(7)
    expect(expandEmbeddedJson(null)).toBe(null)
    expect(expandEmbeddedJson(false)).toBe(false)
  })

  it('does not mutate the input', () => {
    const input = { text: '{"a":1}' }
    const out = expandEmbeddedJson(input)
    expect(input.text).toBe('{"a":1}')
    expect(out).toEqual({ text: { a: 1 } })
  })
})
