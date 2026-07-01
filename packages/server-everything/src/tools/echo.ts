import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerEcho(server: McpServer): void {
  server.registerTool(
    'echo',
    {
      description: 'Echoes the message back. Demo/test fixture.',
      inputSchema: { message: z.string() }
    },
    async ({ message }) => ({
      content: [{ type: 'text', text: `Echo: ${message}` }]
    })
  )
}
