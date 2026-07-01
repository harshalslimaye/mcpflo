import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { CreateMessageResultSchema } from '@modelcontextprotocol/sdk/types.js'

export function registerTriggerSamplingRequest(server: McpServer): void {
  // Called from server.server.oninitialized (see index.ts), so the client's
  // capabilities are already known here — this is not a registration-time
  // race like it would be if called eagerly at server construction.
  const clientCapabilities = server.server.getClientCapabilities() ?? {}
  if (clientCapabilities.sampling === undefined) return

  server.registerTool(
    'trigger-sampling-request',
    {
      description: 'Trigger a request from the server for LLM sampling. Demo/test fixture.',
      inputSchema: {
        prompt: z.string().describe('The prompt to send to the LLM'),
        maxTokens: z.number().default(100).describe('Maximum number of tokens to generate')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async ({ prompt, maxTokens }, extra): Promise<CallToolResult> => {
      const result = await extra.sendRequest(
        {
          method: 'sampling/createMessage',
          params: {
            messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
            systemPrompt: 'You are a helpful test server.',
            maxTokens,
            temperature: 0.7
          }
        },
        CreateMessageResultSchema
      )

      return {
        content: [{ type: 'text', text: `LLM sampling result: \n${JSON.stringify(result, null, 2)}` }]
      }
    }
  )
}
