// Throwaway stdio MCP server for manually testing elicitation: its one tool
// asks the user for details mid-call and echoes back what it received.
// Add it in MCPFlo as a stdio server: command `node`, args `scripts/elicit-server.mjs`.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'elicit-demo', version: '0.0.1' })

server.registerTool(
  'ask-name',
  {
    description: 'Elicits a name/age/subscribe form from the user and echoes the answer',
    inputSchema: { greeting: z.string().optional() }
  },
  async ({ greeting }) => {
    const result = await server.server.elicitInput(
      {
        message: `${greeting ?? 'Hello'}! Please introduce yourself.`,
        requestedSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', title: 'Name', description: 'What should we call you?' },
            age: { type: 'integer', minimum: 0 },
            subscribe: { type: 'boolean', title: 'Subscribe to updates', default: true }
          },
          required: ['name']
        }
      },
      // Give the human plenty of time to fill the form (default is 60s).
      { timeout: 10 * 60_000 }
    )
    return {
      content: [{ type: 'text', text: `Elicitation result: ${JSON.stringify(result)}` }]
    }
  }
)

await server.connect(new StdioServerTransport())
