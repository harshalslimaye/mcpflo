import { encode } from 'gpt-tokenizer'
import type { Tool, Resource, Prompt, MCPServer } from '../../shared/mcp.types'

// A reference context window used only to express a server's footprint as a
// percentage ("~1.70% of a 200K window"). Not a limit MCPFlo enforces — just a
// relatable denominator, since the absolute token count means little on its own.
export const CONTEXT_WINDOW_TOKENS = 200_000

// gpt-tokenizer's default `encode` uses this BPE — surfaced in the UI so the
// "~ Estimated" framing names what it's actually estimating against.
export const TOKENIZER_LABEL = 'cl100k_base'

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

function toolDefinitionText(tool: Tool): string {
  return JSON.stringify({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations
  })
}

function resourceDefinitionText(resource: Resource): string {
  return JSON.stringify({
    uri: resource.uri,
    name: resource.name,
    description: resource.description,
    mimeType: resource.mimeType
  })
}

function promptDefinitionText(prompt: Prompt): string {
  return JSON.stringify({
    name: prompt.name,
    description: prompt.description,
    arguments: prompt.arguments
  })
}

export function estimateToolTokens(tool: Tool): number {
  return countTokens(toolDefinitionText(tool))
}

export function estimateResourceTokens(resource: Resource): number {
  return countTokens(resourceDefinitionText(resource))
}

export function estimatePromptTokens(prompt: Prompt): number {
  return countTokens(promptDefinitionText(prompt))
}

// The size/token cost of one capability's own definition — same idea as
// ResponsePayloadEstimate, but for a tool/resource/prompt's static schema
// rather than a call's response. No binaryBlocks: definitions never carry
// image/audio/blob content.
export interface DefinitionPayloadEstimate {
  tokens: number
  characters: number
  rawBytes: number
}

function definitionPayload(text: string): DefinitionPayloadEstimate {
  return {
    tokens: countTokens(text),
    characters: text.length,
    rawBytes: new TextEncoder().encode(text).byteLength
  }
}

export function estimateToolDefinitionPayload(tool: Tool): DefinitionPayloadEstimate {
  return definitionPayload(toolDefinitionText(tool))
}

export function estimateResourceDefinitionPayload(resource: Resource): DefinitionPayloadEstimate {
  return definitionPayload(resourceDefinitionText(resource))
}

export function estimatePromptDefinitionPayload(prompt: Prompt): DefinitionPayloadEstimate {
  return definitionPayload(promptDefinitionText(prompt))
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

// ── Per-call response footprint ──
//
// Distinct from the capability budget above: this estimates the token cost of
// one actual tool-call/resource-read/prompt-get response, then expresses that
// against several real models' context windows so the same byte count reads
// very differently depending on which model would load it.

// Illustrative, hand-picked reference points — not live data, just a spread
// from frontier-sized windows down to a small on-device one so the comparison
// has range. These drift out of date as the field moves — re-verify against
// each vendor's current docs periodically rather than trusting this list.
export interface ReferenceModel {
  name: string
  windowTokens: number
}

export const REFERENCE_MODELS: ReferenceModel[] = [
  { name: 'fable-5', windowTokens: 1_000_000 },
  { name: 'opus-4-8', windowTokens: 1_000_000 },
  { name: 'sonnet-4-6', windowTokens: 1_000_000 },
  { name: 'gpt-5-5', windowTokens: 1_000_000 },
  { name: 'gemini-3-1-pro', windowTokens: 1_000_000 },
  { name: 'haiku-4-5', windowTokens: 200_000 },
  { name: 'qwen-3-5', windowTokens: 32_000 }
]

export type FootprintStatus = 'safe' | 'caution' | 'danger'

// Thresholds as a fraction of a model's context window: Safe <5%, Caution
// 5–20% (inclusive), Danger >20%.
const SAFE_MAX_FRACTION = 0.05
const CAUTION_MAX_FRACTION = 0.2

export function footprintStatus(fraction: number): FootprintStatus {
  if (fraction < SAFE_MAX_FRACTION) return 'safe'
  if (fraction <= CAUTION_MAX_FRACTION) return 'caution'
  return 'danger'
}

const STATUS_SEVERITY: Record<FootprintStatus, number> = { safe: 0, caution: 1, danger: 2 }

export interface ModelFootprint {
  name: string
  windowTokens: number
  fraction: number
  status: FootprintStatus
}

export interface ResponseFootprint {
  models: ModelFootprint[]
  // The worst-case status across the reference list — drives the overall
  // badge. A response can be Safe against a 1M window and Danger against a
  // 16K one; the badge surfaces whichever risk is real for some model.
  status: FootprintStatus
}

// Expresses a token count against every reference model's context window.
export function computeResponseFootprint(tokens: number): ResponseFootprint {
  const models = REFERENCE_MODELS.map((model) => {
    const fraction = tokens / model.windowTokens
    return {
      name: model.name,
      windowTokens: model.windowTokens,
      fraction,
      status: footprintStatus(fraction)
    }
  })
  const status = models.reduce<FootprintStatus>(
    (worst, m) => (STATUS_SEVERITY[m.status] > STATUS_SEVERITY[worst] ? m.status : worst),
    'safe'
  )
  return { models, status }
}

// The token cost of one actual response payload.
export interface ResponsePayloadEstimate {
  // Tokens over the text content only — see stripBinaryContent below.
  tokens: number
  // Length of the text that was tokenized.
  characters: number
  // UTF-8 byte length of that same text.
  rawBytes: number
  // Count of image/audio/blob content blocks excluded from the estimate.
  binaryBlocks: number
}

// Recognizes MCP's binary content shapes — an image/audio block's `data`
// (paired with an image/* or audio/* mimeType) and a resource content's
// `blob` — and strips them before serializing. Tokenizing base64 as if it
// were text would produce a wildly inflated, meaningless number: vision/audio
// models charge for binary content on an entirely different basis than text
// tokens. Deliberately narrow: a bare `data` field alone isn't enough,
// because JSON-RPC errors legitimately carry a string `data` field
// (`{ code, message, data }` per the JSON-RPC 2.0 spec) that must NOT be
// stripped — only `data` paired with an image/audio mimeType counts.
function stripBinaryContent(value: unknown, counter: { count: number }): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => stripBinaryContent(v, counter))
  }
  if (value === null || typeof value !== 'object') {
    return value
  }

  const obj = value as Record<string, unknown>
  const mimeType = typeof obj.mimeType === 'string' ? obj.mimeType : undefined
  const isBinary =
    typeof obj.blob === 'string' ||
    (typeof obj.data === 'string' && mimeType !== undefined && /^(image|audio)\//.test(mimeType))

  if (isBinary) {
    counter.count += 1
    const rest: Record<string, unknown> = { ...obj }
    delete rest.data
    delete rest.blob
    return stripBinaryContent(rest, counter)
  }

  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(obj)) {
    out[key] = stripBinaryContent(v, counter)
  }
  return out
}

// Extracts the model-facing payload from a JSON-RPC envelope — what an agent
// actually consumes, not the transport wrapper (the jsonrpc/id fields).
function payloadOf(envelope: unknown): unknown {
  if (envelope !== null && typeof envelope === 'object') {
    const e = envelope as Record<string, unknown>
    if ('result' in e) return e.result
    if ('error' in e) return e.error
  }
  return envelope
}

// Estimates the token/size cost of one tool-call, resource-read, or
// prompt-get response. `response` is the full JSON-RPC envelope as stored on
// a *CallRecord (ToolCallRecord.response, etc.) — undefined (no response
// arrived) yields an all-zero estimate rather than throwing.
export function estimateResponseTokens(response: unknown): ResponsePayloadEstimate {
  const counter = { count: 0 }
  const sanitized = stripBinaryContent(payloadOf(response), counter)
  const text = JSON.stringify(sanitized) ?? ''
  return {
    tokens: countTokens(text),
    characters: text.length,
    rawBytes: new TextEncoder().encode(text).byteLength,
    binaryBlocks: counter.count
  }
}
