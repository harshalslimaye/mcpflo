import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { textResource, textResourceUri, blobResourceUri, blobResource } from '../resources/templates'

export function registerGetResourceLinks(server: McpServer): void {
  server.registerTool(
    'get-resource-links',
    {
      description:
        'Returns up to ten resource links that reference different types of resources. Demo/test fixture.',
      inputSchema: {
        count: z.number().min(1).max(10).default(3).describe('Number of resource links to return (1-10)')
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ count }): Promise<CallToolResult> => {
      const content: CallToolResult['content'] = [
        { type: 'text', text: `Here are ${count} resource links to resources available in this server:` }
      ]

      for (let resourceId = 1; resourceId <= count; resourceId++) {
        const isEven = resourceId % 2 === 0
        const uri = isEven ? textResourceUri(resourceId) : blobResourceUri(resourceId)
        const resource = isEven ? textResource(uri, resourceId) : blobResource(uri, resourceId)

        content.push({
          type: 'resource_link',
          uri: resource.uri,
          name: `${isEven ? 'Text' : 'Blob'} Resource ${resourceId}`,
          description: `Resource ${resourceId}: ${
            resource.mimeType === 'text/plain' ? 'plaintext resource' : 'binary blob resource'
          }`,
          mimeType: resource.mimeType
        })
      }

      return { content }
    }
  )
}
