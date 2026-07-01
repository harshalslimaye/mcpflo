import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { beginSimulatedLogging, stopSimulatedLogging } from '../server/logging'

const activeSessions = new Set<string | undefined>()

export function registerToggleSimulatedLogging(server: McpServer): void {
  server.registerTool(
    'toggle-simulated-logging',
    {
      description: 'Toggles simulated, random-leveled logging on or off. Demo/test fixture.',
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
        stopSimulatedLogging(sessionId)
        activeSessions.delete(sessionId)
        return { content: [{ type: 'text', text: `Stopped simulated logging for session ${sessionId}` }] }
      }

      beginSimulatedLogging(server, sessionId)
      activeSessions.add(sessionId)
      return {
        content: [
          {
            type: 'text',
            text: `Started simulated, random-leveled logging for session ${sessionId} at a 5 second pace. Client's selected logging level will be respected. If an interval elapses and the message to be sent is below the selected level, it will not be sent. Thus at higher chosen logging levels, messages should arrive further apart.`
          }
        ]
      }
    }
  )
}
