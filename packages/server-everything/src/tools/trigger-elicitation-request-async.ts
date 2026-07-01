import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const POLL_INTERVAL = 1000
const MAX_POLL_ATTEMPTS = 600

export function registerTriggerElicitationRequestAsync(server: McpServer): void {
  // Called from server.server.oninitialized (see index.ts), so the client's
  // capabilities are already known here — this is not a registration-time
  // race like it would be if called eagerly at server construction.
  const clientCapabilities = server.server.getClientCapabilities() ?? {}
  if (clientCapabilities.elicitation === undefined) return

  server.registerTool(
    'trigger-elicitation-request-async',
    {
      description:
        'Trigger an async elicitation request that the CLIENT executes as a background task. ' +
        'Demonstrates bidirectional MCP tasks where the server sends an elicitation request and ' +
        'the client handles user input asynchronously, allowing the server to poll for completion. ' +
        'Falls back gracefully if the client only supports synchronous elicitation. Demo/test fixture.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (extra): Promise<CallToolResult> => {
      const elicitResponse = await extra.sendRequest(
        {
          method: 'elicitation/create',
          params: {
            task: { ttl: 600000 },
            message: 'Please provide inputs for the following fields (async task demo):',
            requestedSchema: {
              type: 'object',
              properties: {
                name: { title: 'Your Name', type: 'string', description: 'Your full name' },
                favoriteColor: {
                  title: 'Favorite Color',
                  type: 'string',
                  description: 'What is your favorite color?',
                  enum: ['Red', 'Blue', 'Green', 'Yellow', 'Purple']
                },
                agreeToTerms: {
                  title: 'Terms Agreement',
                  type: 'boolean',
                  description: 'Do you agree to the terms and conditions?'
                }
              },
              required: ['name']
            }
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
          z.object({ action: z.string(), content: z.any().optional() })
        ])
      )

      const isTaskResult = 'task' in elicitResponse && elicitResponse.task
      if (!isTaskResult) {
        return {
          content: [
            {
              type: 'text',
              text: `[SYNC] Client executed synchronously:\n${JSON.stringify(elicitResponse, null, 2)}`
            }
          ]
        }
      }

      const taskId = elicitResponse.task.taskId
      const statusMessages: string[] = [`Task created: ${taskId}`]

      let attempts = 0
      let taskStatus = elicitResponse.task.status
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

        if (attempts === 1 || attempts % 10 === 0 || taskStatus !== 'input_required') {
          statusMessages.push(`Poll ${attempts}: ${taskStatus}${taskStatusMessage ? ` - ${taskStatusMessage}` : ''}`)
        }
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

      const content: CallToolResult['content'] = []

      if (result.action === 'accept' && result.content) {
        content.push({ type: 'text', text: '[COMPLETED] User provided the requested information!' })

        const userData = result.content as Record<string, unknown>
        const lines: string[] = []
        if (userData.name) lines.push(`- Name: ${userData.name}`)
        if (userData.favoriteColor) lines.push(`- Favorite Color: ${userData.favoriteColor}`)
        if (userData.agreeToTerms !== undefined) lines.push(`- Agreed to terms: ${userData.agreeToTerms}`)

        content.push({ type: 'text', text: `User inputs:\n${lines.join('\n')}` })
      } else if (result.action === 'decline') {
        content.push({ type: 'text', text: '[DECLINED] User declined to provide the requested information.' })
      } else if (result.action === 'cancel') {
        content.push({ type: 'text', text: '[CANCELLED] User cancelled the elicitation dialog.' })
      }

      content.push({
        type: 'text',
        text: `\nProgress:\n${statusMessages.join('\n')}\n\nRaw result: ${JSON.stringify(result, null, 2)}`
      })

      return { content }
    }
  )
}
