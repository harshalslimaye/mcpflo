import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerSimplePrompt(server: McpServer): void {
  server.registerPrompt(
    'simple-prompt',
    {
      title: 'Simple Prompt',
      description: 'A prompt with no arguments. Demo/test fixture.'
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: 'This is a simple prompt without arguments.' }
        }
      ]
    })
  )
}
