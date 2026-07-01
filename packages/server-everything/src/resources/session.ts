import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Resource, ResourceLink, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'

let counter = 0

// McpServer.registerResource() calls the SDK's registerCapabilities() on its
// very first-ever invocation, which throws once server.connect() has already
// run. Tools register session resources at call-time, which is always
// post-connect, so we register (and immediately disable) one throwaway
// resource before connect to trip that one-time init path early. Disabling
// it hides it from resources/list without undoing the warm-up.
export function initSessionResources(server: McpServer): void {
  server.registerResource(
    '__session_warmup__',
    'mcpflo://session/warmup',
    { mimeType: 'text/plain' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: '' }] })
  ).disable()
}

export function getSessionResourceURI(name: string): string {
  counter += 1
  return `mcpflo://session/resource/${counter}/${encodeURIComponent(name)}`
}

export function registerSessionResource(
  server: McpServer,
  resource: Resource,
  kind: 'text' | 'blob',
  data: string
): ResourceLink {
  server.registerResource(
    resource.name,
    resource.uri,
    { mimeType: resource.mimeType },
    async (uri): Promise<ReadResourceResult> => ({
      contents: [
        kind === 'blob'
          ? { uri: uri.href, mimeType: resource.mimeType, blob: data }
          : { uri: uri.href, mimeType: resource.mimeType, text: data }
      ]
    })
  )

  return {
    type: 'resource_link',
    uri: resource.uri,
    name: resource.name,
    mimeType: resource.mimeType
  }
}
