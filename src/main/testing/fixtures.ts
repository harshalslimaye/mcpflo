import type { ToolCallResult, GetPromptResult, ResourceReadResult } from '../../shared/mcp.types'

// Fixtures shared across engine.test.ts. Named after what makes each one
// structurally distinct, since several look similar at a glance.

// A tool with an outputSchema: structuredContent is the authoritative value,
// mirrored (per spec) as a serialized-JSON text block for older clients.
export const structuredContentResult: ToolCallResult = {
  content: [{ type: 'text', text: '{"temperature":22.5,"conditions":"Partly cloudy"}' }],
  structuredContent: { temperature: 22.5, conditions: 'Partly cloudy' }
}

// No structuredContent, but the single text block happens to be JSON.
export const jsonTextResult: ToolCallResult = {
  content: [{ type: 'text', text: '{"hello":"Bruno"}' }]
}

// A single text block that isn't JSON at all.
export const plainTextResult: ToolCallResult = {
  content: [{ type: 'text', text: 'not json, just prose' }]
}

// A tool-level error (isError: true), the MCP way of reporting a failure
// inside an otherwise-successful JSON-RPC response.
export const isErrorResult: ToolCallResult = {
  content: [{ type: 'text', text: 'Failed to fetch weather data: API rate limit exceeded' }],
  isError: true
}

export const imageResult: ToolCallResult = {
  content: [{ type: 'image', data: 'ZmFrZS1iYXNlNjQ=', mimeType: 'image/png' }]
}

export const emptyResult: ToolCallResult = {}

// Multiple independent text blocks, no structuredContent — the shape that
// exposed the getBody() bug where only the first block was kept and the rest
// were silently dropped.
export const multiTextBlockResult: ToolCallResult = {
  content: [
    { type: 'text', text: 'A' },
    { type: 'text', text: 'B' },
    { type: 'text', text: 'C' }
  ]
}

// ── prompt fixtures ─────────────────────────────────────────────────────────

// Mixed-role messages, each a single text block — the normal shape.
export const promptTextResult: GetPromptResult = {
  description: 'A greeting prompt',
  messages: [
    { role: 'user', content: { type: 'text', text: 'Say hello to {{name}}' } },
    { role: 'assistant', content: { type: 'text', text: 'Hello, Ada!' } }
  ]
}

// A single message whose text happens to be JSON.
export const promptJsonTextResult: GetPromptResult = {
  messages: [{ role: 'user', content: { type: 'text', text: '{"greeting":"hi"}' } }]
}

// A non-text content block (e.g. an embedded resource) mixed with a text one
// — the non-text message is skipped by getText(), same as a tool result's
// non-text content blocks.
export const promptMixedContentResult: GetPromptResult = {
  messages: [
    { role: 'user', content: { type: 'text', text: 'Look at this:' } },
    { role: 'user', content: { type: 'image', data: 'ZmFrZS1iYXNlNjQ=', mimeType: 'image/png' } }
  ]
}

export const promptEmptyResult: GetPromptResult = { messages: [] }

// ── resource fixtures ────────────────────────────────────────────────────────

// A single text resource.
export const resourceTextResult: ResourceReadResult = {
  contents: [{ uri: 'file:///notes.txt', mimeType: 'text/plain', text: 'hello resource' }]
}

// A single binary (blob-only) resource — no `text` at all.
export const resourceBlobResult: ResourceReadResult = {
  contents: [{ uri: 'file:///image.png', mimeType: 'image/png', blob: 'ZmFrZS1iYXNlNjQ=' }]
}

// A resource read that returned both a text entry and a blob entry —
// getText()/getBody() only see the text one.
export const resourceTextAndBlobResult: ResourceReadResult = {
  contents: [
    { uri: 'file:///doc.txt', mimeType: 'text/plain', text: 'the text part' },
    { uri: 'file:///doc.png', mimeType: 'image/png', blob: 'ZmFrZS1iYXNlNjQ=' }
  ]
}

// A single text resource whose text happens to be JSON.
export const resourceJsonTextResult: ResourceReadResult = {
  contents: [{ uri: 'file:///data.json', mimeType: 'application/json', text: '{"count":3}' }]
}
