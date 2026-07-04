import type { ToolCallResult } from '../../shared/mcp.types'

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
