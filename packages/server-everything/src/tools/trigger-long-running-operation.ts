import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export function registerTriggerLongRunningOperation(server: McpServer): void {
  server.registerTool(
    'trigger-long-running-operation',
    {
      description: 'Demonstrates a long running operation with progress updates. Demo/test fixture.',
      inputSchema: {
        duration: z.number().default(10).describe('Duration of the operation in seconds'),
        steps: z.number().default(5).describe('Number of steps in the operation')
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ duration, steps }, extra): Promise<CallToolResult> => {
      const stepDuration = duration / steps
      const progressToken = extra._meta?.progressToken

      for (let i = 1; i < steps + 1; i++) {
        await new Promise((resolve) => setTimeout(resolve, stepDuration * 1000))

        if (progressToken !== undefined) {
          await server.server.notification(
            {
              method: 'notifications/progress',
              params: { progress: i, total: steps, progressToken }
            },
            { relatedRequestId: extra.requestId }
          )
        }
      }

      return {
        content: [
          { type: 'text', text: `Long running operation completed. Duration: ${duration} seconds, Steps: ${steps}.` }
        ]
      }
    }
  )
}
