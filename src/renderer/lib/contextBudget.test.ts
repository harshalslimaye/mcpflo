import { describe, it, expect } from 'vitest'
import {
  CONTEXT_WINDOW_TOKENS,
  computeContextBudget,
  estimatePromptTokens,
  estimateResourceTokens,
  estimateToolTokens
} from './contextBudget'
import type { Prompt, Resource, Tool } from '../../shared/mcp.types'

const tool = (over: Partial<Tool> = {}): Tool => ({
  name: 'create_repository',
  description: 'Create a new repository in your account or an organization.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' }, private: { type: 'boolean' } },
    required: ['name']
  },
  ...over
})

const resource = (over: Partial<Resource> = {}): Resource => ({
  uri: 'repo://octocat/hello-world/tree',
  name: 'tree',
  description: 'File tree of the default branch.',
  mimeType: 'application/json',
  ...over
})

const prompt = (over: Partial<Prompt> = {}): Prompt => ({
  name: 'open_pr_review',
  description: 'Draft a structured review for a pull request.',
  arguments: [{ name: 'pr', description: 'PR number', required: true }],
  ...over
})

describe('per-item estimators', () => {
  it('return a positive count for a minimal item (name only)', () => {
    expect(estimateToolTokens({ name: 'x', inputSchema: { type: 'object' } })).toBeGreaterThan(0)
    expect(estimateResourceTokens({ uri: 'x://y' })).toBeGreaterThan(0)
    expect(estimatePromptTokens({ name: 'x' })).toBeGreaterThan(0)
  })

  it('count more tokens as a tool gains a description and schema', () => {
    const bare = estimateToolTokens({ name: 'create_repository', inputSchema: { type: 'object' } })
    const rich = estimateToolTokens(tool())
    expect(rich).toBeGreaterThan(bare)
  })

  it('count more tokens as a resource gains a description', () => {
    const bare = estimateResourceTokens({ uri: 'repo://octocat/hello-world/tree' })
    const rich = estimateResourceTokens(resource())
    expect(rich).toBeGreaterThan(bare)
  })

  it('count more tokens as a prompt gains arguments', () => {
    const bare = estimatePromptTokens({ name: 'open_pr_review' })
    const rich = estimatePromptTokens(prompt())
    expect(rich).toBeGreaterThan(bare)
  })

  it('are deterministic — same input yields the same count', () => {
    expect(estimateToolTokens(tool())).toBe(estimateToolTokens(tool()))
  })
})

describe('computeContextBudget', () => {
  it('reports counts matching the input lengths', () => {
    const budget = computeContextBudget({
      tools: [tool(), tool({ name: 'b' })],
      resources: [resource()],
      prompts: [prompt(), prompt({ name: 'c' }), prompt({ name: 'd' })]
    })
    expect(budget.tools.count).toBe(2)
    expect(budget.resources.count).toBe(1)
    expect(budget.prompts.count).toBe(3)
    expect(budget.total.count).toBe(6)
  })

  it('sums each category to the total of its per-item estimates', () => {
    const tools = [tool(), tool({ name: 'b', description: 'Another tool.' })]
    const budget = computeContextBudget({ tools, resources: [], prompts: [] })
    const expected = tools.reduce((s, t) => s + estimateToolTokens(t), 0)
    expect(budget.tools.tokens).toBe(expected)
    expect(budget.total.tokens).toBe(expected)
  })

  it('averages tokens per item (rounded)', () => {
    const tools = [tool(), tool({ name: 'b' })]
    const budget = computeContextBudget({ tools, resources: [], prompts: [] })
    expect(budget.tools.avg).toBe(Math.round(budget.tools.tokens / 2))
  })

  it('derives windowFraction from the total over the reference window', () => {
    const budget = computeContextBudget({ tools: [tool()], resources: [], prompts: [] })
    expect(budget.windowFraction).toBeCloseTo(budget.total.tokens / CONTEXT_WINDOW_TOKENS, 10)
  })

  it('splits fractionOfTotal across categories so they sum to 1', () => {
    const budget = computeContextBudget({
      tools: [tool()],
      resources: [resource()],
      prompts: [prompt()]
    })
    const sum =
      budget.tools.fractionOfTotal +
      budget.resources.fractionOfTotal +
      budget.prompts.fractionOfTotal
    expect(sum).toBeCloseTo(1, 10)
  })

  it('assigns the whole fraction to the only populated category', () => {
    const budget = computeContextBudget({ tools: [tool()], resources: [], prompts: [] })
    expect(budget.tools.fractionOfTotal).toBeCloseTo(1, 10)
    expect(budget.resources.fractionOfTotal).toBe(0)
    expect(budget.prompts.fractionOfTotal).toBe(0)
  })

  describe('empty server', () => {
    const budget = computeContextBudget({ tools: [], resources: [], prompts: [] })

    it('zeroes every count and token total', () => {
      expect(budget.total.count).toBe(0)
      expect(budget.total.tokens).toBe(0)
      expect(budget.tools.tokens).toBe(0)
    })

    it('avoids divide-by-zero in the averages', () => {
      expect(budget.tools.avg).toBe(0)
      expect(budget.total.avg).toBe(0)
    })

    it('reports a zero fraction rather than NaN', () => {
      expect(budget.tools.fractionOfTotal).toBe(0)
      expect(budget.windowFraction).toBe(0)
    })
  })

  it('is deterministic for the same server', () => {
    const server = { tools: [tool()], resources: [resource()], prompts: [prompt()] }
    expect(computeContextBudget(server)).toEqual(computeContextBudget(server))
  })
})
