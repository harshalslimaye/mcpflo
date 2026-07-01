import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ElicitResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export function registerTriggerElicitationRequest(server: McpServer): void {
  // Called from server.server.oninitialized (see index.ts), so the client's
  // capabilities are already known here — this is not a registration-time
  // race like it would be if called eagerly at server construction.
  const clientCapabilities = server.server.getClientCapabilities() ?? {}
  if (clientCapabilities.elicitation === undefined) return

  server.registerTool(
    'trigger-elicitation-request',
    {
      description: 'Trigger a request from the server for user elicitation. Demo/test fixture.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (extra): Promise<CallToolResult> => {
      const elicitationResult = await extra.sendRequest(
        {
          method: 'elicitation/create',
          params: {
            message: 'Please provide inputs for the following fields:',
            requestedSchema: {
              type: 'object',
              properties: {
                name: { title: 'String', type: 'string', description: 'Your full, legal name' },
                check: { title: 'Boolean', type: 'boolean', description: 'Agree to the terms and conditions' },
                firstLine: {
                  title: 'String with default',
                  type: 'string',
                  description: 'Favorite first line of a story',
                  default: 'It was a dark and stormy night.'
                },
                email: {
                  title: 'String with email format',
                  type: 'string',
                  format: 'email',
                  description: 'Your email address (will be verified, and never shared with anyone else)'
                },
                homepage: {
                  type: 'string',
                  format: 'uri',
                  title: 'String with uri format',
                  description: 'Portfolio / personal website'
                },
                birthdate: {
                  title: 'String with date format',
                  type: 'string',
                  format: 'date',
                  description: 'Your date of birth'
                },
                integer: {
                  title: 'Integer',
                  type: 'integer',
                  description: 'Your favorite integer (do not give us your phone number, pin, or other sensitive info)',
                  minimum: 1,
                  maximum: 100,
                  default: 42
                },
                number: {
                  title: 'Number in range 1-1000',
                  type: 'number',
                  description: 'Favorite number (there are no wrong answers)',
                  minimum: 0,
                  maximum: 1000,
                  default: 3.14
                },
                untitledSingleSelectEnum: {
                  type: 'string',
                  title: 'Untitled Single Select Enum',
                  description: 'Choose your favorite friend',
                  enum: ['Monica', 'Rachel', 'Joey', 'Chandler', 'Ross', 'Phoebe'],
                  default: 'Monica'
                },
                untitledMultipleSelectEnum: {
                  type: 'array',
                  title: 'Untitled Multiple Select Enum',
                  description: 'Choose your favorite instruments',
                  minItems: 1,
                  maxItems: 3,
                  items: { type: 'string', enum: ['Guitar', 'Piano', 'Violin', 'Drums', 'Bass'] },
                  default: ['Guitar']
                },
                titledSingleSelectEnum: {
                  type: 'string',
                  title: 'Titled Single Select Enum',
                  description: 'Choose your favorite hero',
                  oneOf: [
                    { const: 'hero-1', title: 'Superman' },
                    { const: 'hero-2', title: 'Green Lantern' },
                    { const: 'hero-3', title: 'Wonder Woman' }
                  ],
                  default: 'hero-1'
                },
                titledMultipleSelectEnum: {
                  type: 'array',
                  title: 'Titled Multiple Select Enum',
                  description: 'Choose your favorite types of fish',
                  minItems: 1,
                  maxItems: 3,
                  items: {
                    anyOf: [
                      { const: 'fish-1', title: 'Tuna' },
                      { const: 'fish-2', title: 'Salmon' },
                      { const: 'fish-3', title: 'Trout' }
                    ]
                  },
                  default: ['fish-1']
                },
                legacyTitledEnum: {
                  type: 'string',
                  title: 'Legacy Titled Single Select Enum',
                  description: 'Choose your favorite type of pet',
                  enum: ['pet-1', 'pet-2', 'pet-3', 'pet-4', 'pet-5'],
                  enumNames: ['Cats', 'Dogs', 'Birds', 'Fish', 'Reptiles'],
                  default: 'pet-1'
                }
              },
              required: ['name']
            }
          }
        },
        ElicitResultSchema,
        { timeout: 10 * 60 * 1000 }
      )

      const content: CallToolResult['content'] = []

      if (elicitationResult.action === 'accept' && elicitationResult.content) {
        content.push({ type: 'text', text: '✅ User provided the requested information!' })

        const userData = elicitationResult.content
        const lines: string[] = []
        if (userData.name) lines.push(`- Name: ${userData.name}`)
        if (userData.check !== undefined) lines.push(`- Agreed to terms: ${userData.check}`)
        if (userData.firstLine) lines.push(`- Favorite first line: ${userData.firstLine}`)
        if (userData.email) lines.push(`- Email: ${userData.email}`)
        if (userData.homepage) lines.push(`- Homepage: ${userData.homepage}`)
        if (userData.birthdate) lines.push(`- Birthdate: ${userData.birthdate}`)
        if (userData.integer !== undefined) lines.push(`- Favorite Integer: ${userData.integer}`)
        if (userData.number !== undefined) lines.push(`- Favorite Number: ${userData.number}`)
        if (userData.untitledSingleSelectEnum) lines.push(`- Favorite friend: ${userData.untitledSingleSelectEnum}`)
        if (userData.untitledMultipleSelectEnum)
          lines.push(`- Favorite instruments: ${userData.untitledMultipleSelectEnum}`)
        if (userData.titledSingleSelectEnum) lines.push(`- Favorite hero: ${userData.titledSingleSelectEnum}`)
        if (userData.titledMultipleSelectEnum)
          lines.push(`- Favorite fish: ${userData.titledMultipleSelectEnum}`)
        if (userData.legacyTitledEnum) lines.push(`- Favorite pet type: ${userData.legacyTitledEnum}`)

        content.push({ type: 'text', text: `User inputs:\n${lines.join('\n')}` })
      } else if (elicitationResult.action === 'decline') {
        content.push({ type: 'text', text: '❌ User declined to provide the requested information.' })
      } else if (elicitationResult.action === 'cancel') {
        content.push({ type: 'text', text: '⚠️ User cancelled the elicitation dialog.' })
      }

      content.push({ type: 'text', text: `\nRaw result: ${JSON.stringify(elicitationResult, null, 2)}` })

      return { content }
    }
  )
}
