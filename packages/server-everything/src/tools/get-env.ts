import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerGetEnv(server: McpServer): void {
  server.registerTool(
    'get-env',
    {
      description: 'Dumps the server process environment variables. Demo/test fixture.'
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(process.env, null, 2) }]
    })
  )
}
