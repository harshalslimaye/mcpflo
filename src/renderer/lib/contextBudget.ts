import { encode } from 'gpt-tokenizer'
import type { Tool, Resource, Prompt, MCPServer } from '../../shared/mcp.types'

// A reference context window used only to express a server's footprint as a
// percentage ("~1.70% of a 200K window"). Not a limit MCPFlo enforces — just a
// relatable denominator, since the absolute token count means little on its own.
export const CONTEXT_WINDOW_TOKENS = 200_000

// Tokenizes a string with the default (cl100k_base) BPE. The whole budget is a
// heuristic — actual usage depends on the agent's own tokenizer and which
// capabilities it pulls in — so the exact encoding isn't load-bearing; this is
// a consistent, dependency-light proxy.
function countTokens(text: string): number {
  return encode(text).length
}

// Per-item estimates serialize the *model-facing* shape of each capability —
// roughly what a `tools/list` / `resources/list` / `prompts/list` response
// injects into an agent's context — and tokenize that JSON. MCPFlo-internal
// fields never reach the model, so they're omitted. For tools the inputSchema
// dominates, which is why tools typically eclipse resources and prompts.

export function estimateToolTokens(tool: Tool): number {
  return countTokens(
    JSON.stringify({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations
    })
  )
}

export function estimateResourceTokens(resource: Resource): number {
  return countTokens(
    JSON.stringify({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    })
  )
}

export function estimatePromptTokens(prompt: Prompt): number {
  return countTokens(
    JSON.stringify({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    })
  )
}

// The token cost of one capability category (tools, resources, or prompts).
export interface CapabilityBudget {
  // Number of items in the category.
  count: number
  // Summed token estimate across every item.
  tokens: number
  // Mean tokens per item, rounded; 0 when the category is empty (no divide-by-zero).
  avg: number
  // This category's share of the server's total, as a raw fraction (0..1).
  // Kept unrounded so the UI can both render an exact proportion bar and round
  // it to a display percentage; 0 when the server has no capabilities at all.
  fractionOfTotal: number
}

// A server's full context-budget breakdown, ready for the budget card.
export interface ContextBudget {
  tools: CapabilityBudget
  resources: CapabilityBudget
  prompts: CapabilityBudget
  total: {
    count: number
    tokens: number
    avg: number
  }
  // Total tokens as a raw fraction (0..1) of CONTEXT_WINDOW_TOKENS.
  windowFraction: number
}

function summarize(itemTokens: number[], grandTotal: number): CapabilityBudget {
  const count = itemTokens.length
  const tokens = itemTokens.reduce((sum, t) => sum + t, 0)
  return {
    count,
    tokens,
    avg: count === 0 ? 0 : Math.round(tokens / count),
    fractionOfTotal: grandTotal === 0 ? 0 : tokens / grandTotal
  }
}

// Estimates how many tokens a server's full capability set would add to an
// agent's context, broken down by category. Pure and deterministic — callers
// should memoize, since tokenizing every capability isn't free.
export function computeContextBudget(
  server: Pick<MCPServer, 'tools' | 'resources' | 'prompts'>
): ContextBudget {
  const toolTokens = server.tools.map(estimateToolTokens)
  const resourceTokens = server.resources.map(estimateResourceTokens)
  const promptTokens = server.prompts.map(estimatePromptTokens)

  const grandTotal =
    toolTokens.reduce((s, t) => s + t, 0) +
    resourceTokens.reduce((s, t) => s + t, 0) +
    promptTokens.reduce((s, t) => s + t, 0)

  const totalCount = toolTokens.length + resourceTokens.length + promptTokens.length

  return {
    tools: summarize(toolTokens, grandTotal),
    resources: summarize(resourceTokens, grandTotal),
    prompts: summarize(promptTokens, grandTotal),
    total: {
      count: totalCount,
      tokens: grandTotal,
      avg: totalCount === 0 ? 0 : Math.round(grandTotal / totalCount)
    },
    windowFraction: grandTotal / CONTEXT_WINDOW_TOKENS
  }
}
