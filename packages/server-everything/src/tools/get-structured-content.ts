import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const LOCATIONS = ['New York', 'Chicago', 'Los Angeles'] as const

const WEATHER_BY_LOCATION: Record<
  (typeof LOCATIONS)[number],
  { temperature: number; conditions: string; humidity: number }
> = {
  'New York': { temperature: 33, conditions: 'Cloudy', humidity: 82 },
  Chicago: { temperature: 36, conditions: 'Light rain / drizzle', humidity: 82 },
  'Los Angeles': { temperature: 73, conditions: 'Sunny / Clear', humidity: 48 }
}

export function registerGetStructuredContent(server: McpServer): void {
  server.registerTool(
    'get-structured-content',
    {
      description:
        'Returns structured content along with an output schema for client data validation. Demo/test fixture.',
      inputSchema: {
        location: z.enum(LOCATIONS).describe('Choose city')
      },
      outputSchema: {
        temperature: z.number().describe('Temperature in celsius'),
        conditions: z.string().describe('Weather conditions description'),
        humidity: z.number().describe('Humidity percentage')
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ location }): Promise<CallToolResult> => {
      const weather = WEATHER_BY_LOCATION[location]

      return {
        content: [{ type: 'text', text: JSON.stringify(weather) }],
        structuredContent: weather
      }
    }
  )
}
