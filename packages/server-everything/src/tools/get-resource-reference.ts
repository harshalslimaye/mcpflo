import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  textResource,
  textResourceUri,
  blobResourceUri,
  blobResource,
  RESOURCE_TYPE_BLOB,
  RESOURCE_TYPE_TEXT
} from '../resources/templates'

export function registerGetResourceReference(server: McpServer): void {
  server.registerTool(
    'get-resource-reference',
    {
      description:
        'Returns a resource reference that can be used by MCP clients. Demo/test fixture.',
      inputSchema: {
        resourceType: z.enum([RESOURCE_TYPE_TEXT, RESOURCE_TYPE_BLOB]).default(RESOURCE_TYPE_TEXT),
        resourceId: z.number().int().positive().default(1).describe('ID of the resource to fetch')
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ resourceType, resourceId }): Promise<CallToolResult> => {
      const uri =
        resourceType === RESOURCE_TYPE_TEXT ? textResourceUri(resourceId) : blobResourceUri(resourceId)
      const resource =
        resourceType === RESOURCE_TYPE_TEXT
          ? textResource(uri, resourceId)
          : blobResource(uri, resourceId)

      return {
        content: [
          { type: 'text', text: `Returning resource reference for Resource ${resourceId}:` },
          { type: 'resource', resource },
          { type: 'text', text: `You can access this resource using the URI: ${resource.uri}` }
        ]
      }
    }
  )
}
