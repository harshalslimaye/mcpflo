import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { syncRoots } from '../server/roots'

export function registerGetRootsList(server: McpServer): void {
  // Called from server.server.oninitialized (see index.ts), so the client's
  // capabilities are already known here — this is not a registration-time
  // race like it would be if called eagerly at server construction.
  const clientCapabilities = server.server.getClientCapabilities() ?? {}
  if (clientCapabilities.roots === undefined) return

  server.registerTool(
    'get-roots-list',
    {
      description:
        "Lists the current MCP roots provided by the client. Demonstrates the roots protocol " +
        "capability even though this server doesn't access files. Demo/test fixture.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (extra): Promise<CallToolResult> => {
      const currentRoots = await syncRoots(server, extra.sessionId)

      if (!currentRoots || currentRoots.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text:
                'The client supports roots but no roots are currently configured.\n\n' +
                'This could mean:\n' +
                "1. The client hasn't provided any roots yet\n" +
                '2. The client provided an empty roots list\n' +
                '3. The roots configuration is still being loaded'
            }
          ]
        }
      }

      const rootsList = currentRoots
        .map((root, index) => `${index + 1}. ${root.name || 'Unnamed Root'}\n   URI: ${root.uri}`)
        .join('\n\n')

      return {
        content: [
          {
            type: 'text',
            text:
              `Current MCP Roots (${currentRoots.length} total):\n\n${rootsList}\n\n` +
              "Note: This server demonstrates the roots protocol capability but doesn't actually access files. " +
              'The roots are provided by the MCP client and can be used by servers that need file system access.'
          }
        ]
      }
    }
  )
}
