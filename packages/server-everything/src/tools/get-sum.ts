import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerGetSum(server: McpServer): void {
  server.registerTool(
    'get-sum',
    {
      description: 'Adds two numbers. Demo/test fixture.',
      inputSchema: { a: z.number(), b: z.number() }
    },
    async ({ a, b }) => ({
      content: [{ type: 'text', text: `The sum of ${a} and ${b} is ${a + b}.` }]
    })
  )
}
