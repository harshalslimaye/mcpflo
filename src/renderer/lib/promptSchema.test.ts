import { describe, it, expect } from 'vitest'
import { buildPromptSchema, buildPromptUiSchema, isPromptEmpty } from './promptSchema'
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

describe('buildPromptUiSchema', () => {
  const prompt: Prompt = {
    name: 'completable-prompt',
    arguments: [
      { name: 'department' },
      { name: 'notes', description: 'Free-form notes' },
      { name: 'name' }
    ]
  }

  it('assigns the completion widget to every field when completions are supported', () => {
    const ui = buildPromptUiSchema(prompt, { completions: true })
    expect(ui.department).toEqual({ 'ui:widget': 'CompletionWidget' })
    expect(ui.name).toEqual({ 'ui:widget': 'CompletionWidget' })
  })

  it('assigns no widget at all when completions are not supported', () => {
    const ui = buildPromptUiSchema(prompt, { completions: false })
    expect(ui.department).toBeUndefined()
    expect(ui.name).toBeUndefined()
  })

  it('keeps a prose field on textarea instead of the completion widget', () => {
    // "notes" matches layout.ts's prose regex, so buildUiSchema already
    // assigns textarea to it — completion must not override that (D10).
    const ui = buildPromptUiSchema(prompt, { completions: true })
    expect(ui.notes).toEqual({ 'ui:widget': 'textarea' })
  })

  it('still assigns textarea to a prose field when completions are not supported', () => {
    const ui = buildPromptUiSchema(prompt, { completions: false })
    expect(ui.notes).toEqual({ 'ui:widget': 'textarea' })
  })

  it('produces an empty uiSchema for a prompt with no arguments, regardless of completions', () => {
    expect(buildPromptUiSchema({ name: 'ping' }, { completions: true })).toEqual({})
    expect(buildPromptUiSchema({ name: 'ping' }, { completions: false })).toEqual({})
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
