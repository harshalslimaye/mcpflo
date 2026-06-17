import { describe, it, expect } from 'vitest'
import { buildPromptSchema, isPromptEmpty } from './promptSchema'
import type { Prompt } from '../../shared/mcp.types'

describe('buildPromptSchema', () => {
  it('maps each argument to a string property', () => {
    const prompt: Prompt = {
      name: 'summarize',
      arguments: [
        { name: 'topic', description: 'What to summarize', required: true },
        { name: 'tone' }
      ]
    }
    const schema = buildPromptSchema(prompt)
    expect(schema.type).toBe('object')
    expect(schema.properties).toEqual({
      topic: { type: 'string', description: 'What to summarize' },
      tone: { type: 'string' }
    })
  })

  it('lists only the required arguments in `required`', () => {
    const schema = buildPromptSchema({
      name: 'p',
      arguments: [{ name: 'a', required: true }, { name: 'b' }, { name: 'c', required: true }]
    })
    expect(schema.required).toEqual(['a', 'c'])
  })

  it('omits `required` entirely when no argument is required', () => {
    const schema = buildPromptSchema({ name: 'p', arguments: [{ name: 'a' }] })
    expect(schema.required).toBeUndefined()
  })

  it('produces an empty-properties object for a prompt with no arguments', () => {
    const schema = buildPromptSchema({ name: 'ping' })
    expect(schema.properties).toEqual({})
    expect(schema.required).toBeUndefined()
  })
})

describe('isPromptEmpty', () => {
  it('is true for a prompt with no arguments', () => {
    expect(isPromptEmpty({ name: 'ping' })).toBe(true)
    expect(isPromptEmpty({ name: 'ping', arguments: [] })).toBe(true)
  })

  it('is false for a prompt with at least one argument', () => {
    expect(isPromptEmpty({ name: 'p', arguments: [{ name: 'a' }] })).toBe(false)
  })
})
