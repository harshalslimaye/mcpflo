import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerSimplePrompt } from './simple'
import { registerArgumentsPrompt } from './args'
import { registerPromptWithCompletions } from './completions'
import { registerEmbeddedResourcePrompt } from './resource'

// Add one entry per prompt file here as prompts are added, one at a time.
const registerFns: Array<(server: McpServer) => void> = [
  registerSimplePrompt,
  registerArgumentsPrompt,
  registerPromptWithCompletions,
  registerEmbeddedResourcePrompt
]

export function registerPrompts(server: McpServer): void {
  for (const register of registerFns) {
    register(server)
  }
}
