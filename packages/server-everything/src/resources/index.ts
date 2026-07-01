import { join } from 'path'
import { readFileSync } from 'fs'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerResourceTemplates } from './templates'
import { registerFileResources } from './file-resources'
import { resolveDocsDir } from './docsDir'

export function registerResources(server: McpServer): void {
  registerResourceTemplates(server)
  registerFileResources(server)
}

export function readInstructions(): string {
  // __dirname is a real CommonJS module-scope binding here, no import.meta
  // shim needed.
  const filePath = join(resolveDocsDir(__dirname), 'instructions.md')
  try {
    return readFileSync(filePath, 'utf-8')
  } catch (error) {
    return `Server instructions not loaded: ${error}`
  }
}
