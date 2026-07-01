import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { beginSimulatedResourceUpdates, stopSimulatedResourceUpdates } from '../resources/subscriptions'

const activeSessions = new Set<string | undefined>()

export function registerToggleSubscriberUpdates(server: McpServer): void {
  server.registerTool(
    'toggle-subscriber-updates',
    {
      description: 'Toggles simulated resource subscription updates on or off. Demo/test fixture.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (extra): Promise<CallToolResult> => {
      const sessionId = extra.sessionId

      if (activeSessions.has(sessionId)) {
        stopSimulatedResourceUpdates(sessionId)
        activeSessions.delete(sessionId)
        return { content: [{ type: 'text', text: `Stopped simulated resource updates for session ${sessionId}` }] }
      }

      beginSimulatedResourceUpdates(server, sessionId)
      activeSessions.add(sessionId)
      return {
        content: [
          {
            type: 'text',
            text: `Started simulated resource updated notifications for session ${sessionId} at a 5 second pace. Client will receive updates for any resources it is subscribed to.`
          }
        ]
      }
    }
  )
}
