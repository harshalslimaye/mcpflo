import { join } from 'path'
import { readdirSync, readFileSync, statSync } from 'fs'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveDocsDir } from './docsDir'

function getMimeType(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.json')) return 'application/json'
  return 'text/plain'
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, 'utf-8')
  } catch (error) {
    return `Error reading file: ${path}. ${error}`
  }
}

export function registerFileResources(server: McpServer): void {
  // __dirname is a real CommonJS module-scope binding here, no import.meta
  // shim needed.
  const docsDir = resolveDocsDir(__dirname)

  let entries: string[] = []
  try {
    entries = readdirSync(docsDir)
  } catch {
    return
  }

  for (const name of entries) {
    const fullPath = join(docsDir, name)
    try {
      if (!statSync(fullPath).isFile()) continue
    } catch {
      continue
    }

    const uri = `mcpflo://static/document/${encodeURIComponent(name)}`
    const mimeType = getMimeType(name)
    const description = `Static document file exposed from docs/: ${name}`

    server.registerResource(name, uri, { mimeType, description }, async (readUri) => ({
      contents: [{ uri: readUri.toString(), mimeType, text: readFileSafe(fullPath) }]
    }))
  }
}
