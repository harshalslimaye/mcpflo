import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

function valueKind(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function registerUntypedPayloadAndMap(server: McpServer): void {
  server.registerTool(
    'untyped-payload-and-map',
    {
      description:
        'Accepts a required untyped payload plus map-style properties to stress-test free-form JSON inputs and additionalProperties object rendering. Demo/test fixture.',
      inputSchema: {
        payload: z.unknown().describe('Required free-form JSON value (object/array/string/number/boolean/null)'),
        labels: z
          .record(z.string(), z.string())
          .default({})
          .describe('String map of label key/value pairs (additionalProperties style)'),
        options: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .default({})
          .describe('Flexible map for primitive option values'),
        strict: z.boolean().default(false)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ payload, labels, options, strict }): Promise<CallToolResult> => {
      const labelKeys = Object.keys(labels)
      const optionKeys = Object.keys(options)
      const payloadType = valueKind(payload)

      const text = [
        `Payload type: ${payloadType}`,
        `Strict mode: ${strict}`,
        `Label count: ${labelKeys.length}`,
        `Option count: ${optionKeys.length}`,
        `Label keys: ${labelKeys.length > 0 ? labelKeys.join(', ') : '(none)'}`,
        `Option keys: ${optionKeys.length > 0 ? optionKeys.join(', ') : '(none)'}`
      ].join('\n')

      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          payload,
          labels,
          options,
          strict,
          payloadType,
          labelKeys,
          optionKeys
        }
      }
    }
  )
}
