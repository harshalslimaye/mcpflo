import { describe, it, expect } from 'vitest'
import { resolveToolArgs, resolvePromptArgs, seedToolDefaults } from './autoArgs'
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

describe('resolveToolArgs — no marked request (null)', () => {
  it('is ok with no required fields', () => {
    const result = resolveToolArgs(
      tool({ type: 'object', properties: { q: { type: 'string' } } }),
      null
    )
    expect(result.ok).toBe(true)
  })

  it('is ok when every required field has a schema default', () => {
    const result = resolveToolArgs(
      tool({
        type: 'object',
        properties: { name: { type: 'string', default: 'x' } },
        required: ['name']
      }),
      null
    )
    expect(result.ok).toBe(true)
    expect(result.args).toEqual({ name: 'x' })
  })

  it('is ok when a required boolean seeds to false', () => {
    const result = resolveToolArgs(
      tool({ type: 'object', properties: { flag: { type: 'boolean' } }, required: ['flag'] }),
      null
    )
    expect(result.ok).toBe(true)
    expect(result.args).toEqual({ flag: false })
  })

  it('is not ok when a required field has no derivable default', () => {
    const result = resolveToolArgs(
      tool({ type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }),
      null
    )
    expect(result.ok).toBe(false)
  })
})

describe('resolveToolArgs — with a marked Saved Request', () => {
  it('uses the marked request over defaults for a required field with no schema default', () => {
    const result = resolveToolArgs(
      tool({ type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }),
      { query: 'hello' }
    )
    expect(result.ok).toBe(true)
    expect(result.args).toEqual({ query: 'hello' })
  })

  it('still fills a required field the marked request omits, from schema defaults', () => {
    const result = resolveToolArgs(
      tool({
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer', default: 5 }
        },
        required: ['query', 'limit']
      }),
      { query: 'hello' }
    )
    expect(result.ok).toBe(true)
    expect(result.args).toEqual({ query: 'hello', limit: 5 })
  })

  it('is not ok when the marked request still leaves a required field unset', () => {
    const result = resolveToolArgs(
      tool({
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'integer' } },
        required: ['query', 'limit']
      }),
      { query: 'hello' }
    )
    expect(result.ok).toBe(false)
  })

  it('the marked request overrides a schema default, not just fills gaps', () => {
    const result = resolveToolArgs(
      tool({
        type: 'object',
        properties: { name: { type: 'string', default: 'x' } },
        required: ['name']
      }),
      { name: 'overridden' }
    )
    expect(result.args).toEqual({ name: 'overridden' })
  })
})

describe('resolvePromptArgs — no marked request (null)', () => {
  it('is ok when the prompt has no required arguments', () => {
    const prompt: Prompt = { name: 'p', arguments: [{ name: 'note', required: false }] }
    expect(resolvePromptArgs(prompt, null).ok).toBe(true)
  })

  it('is ok when the prompt has no arguments at all', () => {
    const prompt: Prompt = { name: 'p' }
    expect(resolvePromptArgs(prompt, null).ok).toBe(true)
  })

  it('is not ok when the prompt has a required argument', () => {
    const prompt: Prompt = { name: 'p', arguments: [{ name: 'topic', required: true }] }
    expect(resolvePromptArgs(prompt, null).ok).toBe(false)
  })
})

describe('resolvePromptArgs — with a marked Saved Request', () => {
  it('uses the marked request to satisfy a required argument', () => {
    const prompt: Prompt = { name: 'p', arguments: [{ name: 'topic', required: true }] }
    const result = resolvePromptArgs(prompt, { topic: 'mcp' })
    expect(result.ok).toBe(true)
    expect(result.args).toEqual({ topic: 'mcp' })
  })

  it('drops non-string values from the marked request', () => {
    const prompt: Prompt = { name: 'p', arguments: [{ name: 'topic', required: true }] }
    const result = resolvePromptArgs(prompt, { topic: 'mcp', count: 3 })
    expect(result.args).toEqual({ topic: 'mcp' })
  })

  it('is not ok when the marked request omits a required argument', () => {
    const prompt: Prompt = { name: 'p', arguments: [{ name: 'topic', required: true }] }
    const result = resolvePromptArgs(prompt, { tone: 'casual' })
    expect(result.ok).toBe(false)
  })

  it('is not ok when the marked request has an empty string for a required argument', () => {
    const prompt: Prompt = { name: 'p', arguments: [{ name: 'topic', required: true }] }
    const result = resolvePromptArgs(prompt, { topic: '' })
    expect(result.ok).toBe(false)
  })
})
