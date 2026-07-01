import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { TINY_MCPFLO_IMAGE } from './get-tiny-image'

const AnnotatedMessageSchema = {
  messageType: z
    .enum(['error', 'success', 'debug'])
    .describe('Type of message to demonstrate different annotation patterns'),
  includeImage: z.boolean().default(false).describe('Whether to include an example image')
}

export function registerAnnotatedMessage(server: McpServer): void {
  server.registerTool(
    'annotated-message',
    {
      description: 'Returns content with audience/priority annotations. Demo/test fixture.',
      inputSchema: AnnotatedMessageSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ messageType, includeImage }): Promise<CallToolResult> => {
      const content: CallToolResult['content'] = []

      if (messageType === 'error') {
        content.push({
          type: 'text',
          text: 'Error: Operation failed',
          annotations: {
            priority: 1.0,
            audience: ['user', 'assistant']
          }
        })
      } else if (messageType === 'success') {
        content.push({
          type: 'text',
          text: 'Operation completed successfully',
          annotations: {
            priority: 0.7,
            audience: ['user']
          }
        })
      } else {
        content.push({
          type: 'text',
          text: 'Debug: Cache hit ratio 0.95, latency 150ms',
          annotations: {
            priority: 0.3,
            audience: ['assistant']
          }
        })
      }

      if (includeImage) {
        content.push({
          type: 'image',
          data: TINY_MCPFLO_IMAGE,
          mimeType: 'image/png',
          annotations: {
            priority: 0.5,
            audience: ['user']
          }
        })
      }

      return { content }
    }
  )
}
