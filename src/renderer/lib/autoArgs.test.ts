import { describe, it, expect } from 'vitest'
import { autoToolArgs, autoPromptArgs, seedToolDefaults } from './autoArgs'
import type { Tool, Prompt } from '../../shared/mcp.types'

function tool(inputSchema: Tool['inputSchema']): Tool {
  return { name: 'x', inputSchema }
}

describe('seedToolDefaults', () => {
  it('seeds a required boolean to false', () => {
    const schema = tool({
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      required: ['enabled']
    }).inputSchema
    expect(seedToolDefaults(schema)).toEqual({ enabled: false })
  })
})

describe('autoToolArgs', () => {
  it('is ok with no required fields', () => {
    const result = autoToolArgs(tool({ type: 'object', properties: { q: { type: 'string' } } }))
    expect(result.ok).toBe(true)
  })

  it('is ok when every required field has a schema default', () => {
    const result = autoToolArgs(
      tool({
        type: 'object',
        properties: { name: { type: 'string', default: 'x' } },
        required: ['name']
      })
    )
    expect(result.ok).toBe(true)
    expect(result.args).toEqual({ name: 'x' })
  })

  it('is ok when a required boolean seeds to false', () => {
    const result = autoToolArgs(
      tool({ type: 'object', properties: { flag: { type: 'boolean' } }, required: ['flag'] })
    )
    expect(result.ok).toBe(true)
    expect(result.args).toEqual({ flag: false })
  })

  it('is not ok when a required field has no derivable default', () => {
    const result = autoToolArgs(
      tool({ type: 'object', properties: { query: { type: 'string' } }, required: ['query'] })
    )
    expect(result.ok).toBe(false)
  })
})

describe('autoPromptArgs', () => {
  it('is ok when the prompt has no required arguments', () => {
    const prompt: Prompt = { name: 'p', arguments: [{ name: 'note', required: false }] }
    expect(autoPromptArgs(prompt).ok).toBe(true)
  })

  it('is ok when the prompt has no arguments at all', () => {
    const prompt: Prompt = { name: 'p' }
    expect(autoPromptArgs(prompt).ok).toBe(true)
  })

  it('is not ok when the prompt has a required argument', () => {
    const prompt: Prompt = { name: 'p', arguments: [{ name: 'topic', required: true }] }
    expect(autoPromptArgs(prompt).ok).toBe(false)
  })
})
