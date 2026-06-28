import { describe, it, expect } from 'vitest'
import { encode } from 'gpt-tokenizer'
import {
  CONTEXT_WINDOW_TOKENS,
  REFERENCE_MODELS,
  computeContextBudget,
  computeResponseFootprint,
  estimatePromptDefinitionPayload,
  estimatePromptTokens,
  estimateResourceDefinitionPayload,
  estimateResourceTokens,
  estimateResponseTokens,
  estimateToolDefinitionPayload,
  estimateToolTokens,
  footprintStatus
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

describe('definition payload estimators', () => {
  it('agree with the single-number estimators on tokens', () => {
    expect(estimateToolDefinitionPayload(tool()).tokens).toBe(estimateToolTokens(tool()))
    expect(estimateResourceDefinitionPayload(resource()).tokens).toBe(
      estimateResourceTokens(resource())
    )
    expect(estimatePromptDefinitionPayload(prompt()).tokens).toBe(estimatePromptTokens(prompt()))
  })

  it('report characters and rawBytes consistent with the serialized definition', () => {
    const estimate = estimateToolDefinitionPayload(tool())
    const text = JSON.stringify({
      name: tool().name,
      description: tool().description,
      inputSchema: tool().inputSchema,
      annotations: tool().annotations
    })
    expect(estimate.characters).toBe(text.length)
    expect(estimate.rawBytes).toBe(new TextEncoder().encode(text).byteLength)
  })

  it('return a positive estimate for a minimal item', () => {
    const minimal = estimateToolDefinitionPayload({ name: 'x', inputSchema: { type: 'object' } })
    expect(minimal.tokens).toBeGreaterThan(0)
    expect(minimal.characters).toBeGreaterThan(0)
    expect(minimal.rawBytes).toBeGreaterThan(0)
  })

  it('are deterministic for the same item', () => {
    expect(estimateToolDefinitionPayload(tool())).toEqual(estimateToolDefinitionPayload(tool()))
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

describe('footprintStatus', () => {
  it('is safe below 5%', () => {
    expect(footprintStatus(0)).toBe('safe')
    expect(footprintStatus(0.0499)).toBe('safe')
  })

  it('is caution from 5% up to and including 20%', () => {
    expect(footprintStatus(0.05)).toBe('caution')
    expect(footprintStatus(0.1)).toBe('caution')
    expect(footprintStatus(0.2)).toBe('caution')
  })

  it('is danger above 20%, including beyond 100%', () => {
    expect(footprintStatus(0.2001)).toBe('danger')
    expect(footprintStatus(1.5)).toBe('danger')
  })
})

describe('computeResponseFootprint', () => {
  it('returns one entry per reference model, in order, with the right fraction', () => {
    const footprint = computeResponseFootprint(8_000)
    expect(footprint.models.map((m) => m.name)).toEqual(REFERENCE_MODELS.map((m) => m.name))
    for (const m of footprint.models) {
      const ref = REFERENCE_MODELS.find((r) => r.name === m.name)!
      expect(m.fraction).toBeCloseTo(8_000 / ref.windowTokens, 10)
      expect(m.status).toBe(footprintStatus(m.fraction))
    }
  })

  it('matches the worked example: 8,000 tokens is Safe against every model except the smallest', () => {
    const footprint = computeResponseFootprint(8_000)
    const byName = Object.fromEntries(footprint.models.map((m) => [m.name, m]))
    expect(byName['fable-5'].status).toBe('safe')
    expect(byName['opus-4-8'].status).toBe('safe')
    expect(byName['sonnet-4-6'].status).toBe('safe')
    expect(byName['gpt-5-5'].status).toBe('safe')
    expect(byName['gemini-3-1-pro'].status).toBe('safe')
    expect(byName['haiku-4-5'].status).toBe('safe')
    expect(byName['qwen-3-5'].status).toBe('danger')
  })

  it('reports the worst-case status across the list as the overall status', () => {
    expect(computeResponseFootprint(8_000).status).toBe('danger')
    expect(computeResponseFootprint(0).status).toBe('safe')
  })

  it('reports caution overall when the worst model lands in the caution band (no danger present)', () => {
    // 10% of the smallest window (32K), and under 5% of every larger one.
    const footprint = computeResponseFootprint(32_000 * 0.1)
    expect(footprint.status).toBe('caution')
  })

  it('is deterministic for the same token count', () => {
    expect(computeResponseFootprint(8_000)).toEqual(computeResponseFootprint(8_000))
  })
})

describe('estimateResponseTokens', () => {
  it('returns an all-zero estimate when there is no response', () => {
    expect(estimateResponseTokens(undefined)).toEqual({
      tokens: 0,
      characters: 0,
      rawBytes: 0,
      binaryBlocks: 0
    })
  })

  it('tokenizes a plain-text result and reports matching character/byte counts', () => {
    const envelope = {
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: 'hello world' }] }
    }
    const estimate = estimateResponseTokens(envelope)
    const expectedText = JSON.stringify(envelope.result)
    expect(estimate.characters).toBe(expectedText.length)
    expect(estimate.rawBytes).toBe(new TextEncoder().encode(expectedText).byteLength)
    expect(estimate.tokens).toBeGreaterThan(0)
    expect(estimate.binaryBlocks).toBe(0)
  })

  it('does not mistake a JSON-RPC error’s data field for binary content', () => {
    const envelope = {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -1, message: 'boom', data: 'extra detail' }
    }
    const estimate = estimateResponseTokens(envelope)
    expect(estimate.binaryBlocks).toBe(0)
    expect(estimate.characters).toBe(JSON.stringify(envelope.error).length)
  })

  it('excludes an image content block (data + image/* mimeType) and counts it', () => {
    const withImage = {
      result: {
        content: [
          { type: 'text', text: 'hi' },
          { type: 'image', data: 'iVBORw0KGgoAAAA'.repeat(50), mimeType: 'image/png' }
        ]
      }
    }
    const estimate = estimateResponseTokens(withImage)
    expect(estimate.binaryBlocks).toBe(1)
    // The stripped estimate must be smaller than naively tokenizing the whole
    // (still-base64-laden) payload — otherwise the exclusion did nothing.
    const naiveTokens = encode(JSON.stringify(withImage.result)).length
    expect(estimate.tokens).toBeLessThan(naiveTokens)
  })

  it('excludes an audio content block the same way', () => {
    const withAudio = {
      result: {
        content: [{ type: 'audio', data: 'UklGRiQAAABXQVZF'.repeat(50), mimeType: 'audio/wav' }]
      }
    }
    expect(estimateResponseTokens(withAudio).binaryBlocks).toBe(1)
  })

  it('excludes a resource content block’s blob field', () => {
    const withBlob = {
      result: {
        contents: [{ uri: 'file://x.png', mimeType: 'image/png', blob: 'aGVsbG8='.repeat(50) }]
      }
    }
    expect(estimateResponseTokens(withBlob).binaryBlocks).toBe(1)
  })

  it('counts multiple binary blocks across an array', () => {
    const withTwoImages = {
      result: {
        content: [
          { type: 'image', data: 'a'.repeat(200), mimeType: 'image/png' },
          { type: 'image', data: 'b'.repeat(200), mimeType: 'image/jpeg' }
        ]
      }
    }
    expect(estimateResponseTokens(withTwoImages).binaryBlocks).toBe(2)
  })

  it('does not strip a data field that lacks an image/audio mimeType', () => {
    const notBinary = { result: { data: 'just a string', mimeType: 'application/json' } }
    const estimate = estimateResponseTokens(notBinary)
    expect(estimate.binaryBlocks).toBe(0)
    expect(estimate.characters).toBe(JSON.stringify(notBinary.result).length)
  })

  it('is deterministic for the same response', () => {
    const envelope = { result: { content: [{ type: 'text', text: 'x' }] } }
    expect(estimateResponseTokens(envelope)).toEqual(estimateResponseTokens(envelope))
  })
})
