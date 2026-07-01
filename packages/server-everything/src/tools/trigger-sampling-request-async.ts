import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const POLL_INTERVAL = 1000
const MAX_POLL_ATTEMPTS = 60

export function registerTriggerSamplingRequestAsync(server: McpServer): void {
  // Called from server.server.oninitialized (see index.ts), so the client's
  // capabilities are already known here — this is not a registration-time
  // race like it would be if called eagerly at server construction.
  const clientCapabilities = server.server.getClientCapabilities() ?? {}
  if (clientCapabilities.sampling === undefined) return

  server.registerTool(
    'trigger-sampling-request-async',
    {
      description:
        'Trigger an async sampling request that the CLIENT executes as a background task. ' +
        'Demonstrates bidirectional MCP tasks where the server sends a request and the client ' +
        'executes it asynchronously, allowing the server to poll for progress and results. ' +
        'Falls back gracefully if the client only supports synchronous sampling. Demo/test fixture.',
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
      const samplingResponse = await extra.sendRequest(
        {
          method: 'sampling/createMessage',
          params: {
            task: { ttl: 300000 },
            messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
            systemPrompt: 'You are a helpful test server.',
            maxTokens,
            temperature: 0.7
          }
        },
        z.union([
          z.object({
            task: z.object({
              taskId: z.string(),
              status: z.string(),
              pollInterval: z.number().optional(),
              statusMessage: z.string().optional()
            })
          }),
          z.object({
            role: z.string(),
            content: z.any(),
            model: z.string(),
            stopReason: z.string().optional()
          })
        ])
      )

      const isTaskResult = 'task' in samplingResponse && samplingResponse.task
      if (!isTaskResult) {
        return {
          content: [
            {
              type: 'text',
              text: `[SYNC] Client executed synchronously:\n${JSON.stringify(samplingResponse, null, 2)}`
            }
          ]
        }
      }

      const taskId = samplingResponse.task.taskId
      const statusMessages: string[] = [`Task created: ${taskId}`]

      let attempts = 0
      let taskStatus = samplingResponse.task.status
      let taskStatusMessage: string | undefined

      while (
        taskStatus !== 'completed' &&
        taskStatus !== 'failed' &&
        taskStatus !== 'cancelled' &&
        attempts < MAX_POLL_ATTEMPTS
      ) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
        attempts++

        const pollResult = await extra.sendRequest(
          { method: 'tasks/get', params: { taskId } },
          z.looseObject({ status: z.string(), statusMessage: z.string().optional() })
        )

        taskStatus = pollResult.status
        taskStatusMessage = pollResult.statusMessage
        statusMessages.push(`Poll ${attempts}: ${taskStatus}${taskStatusMessage ? ` - ${taskStatusMessage}` : ''}`)
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        return {
          content: [
            {
              type: 'text',
              text: `[TIMEOUT] Task timed out after ${MAX_POLL_ATTEMPTS} poll attempts\n\nProgress:\n${statusMessages.join('\n')}`
            }
          ]
        }
      }

      if (taskStatus === 'failed' || taskStatus === 'cancelled') {
        return {
          content: [
            {
              type: 'text',
              text: `[${taskStatus.toUpperCase()}] ${taskStatusMessage || 'No message'}\n\nProgress:\n${statusMessages.join('\n')}`
            }
          ]
        }
      }

      const result = await extra.sendRequest({ method: 'tasks/result', params: { taskId } }, z.any())

      return {
        content: [
          {
            type: 'text',
            text: `[COMPLETED] Async sampling completed!\n\n**Progress:**\n${statusMessages.join('\n')}\n\n**Result:**\n${JSON.stringify(result, null, 2)}`
          }
        ]
      }
    }
  )
}
