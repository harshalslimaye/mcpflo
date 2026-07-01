import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerAdd(server: McpServer): void {
  server.registerTool(
    'add',
    {
      description: 'Adds two numbers. Demo/test fixture.',
      inputSchema: { a: z.number(), b: z.number() }
    },
    async ({ a, b }) => ({
      content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }]
    })
  )
}
