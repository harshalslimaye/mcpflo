import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  resourceTypeCompleter,
  resourceIdForPromptCompleter,
  textResource,
  textResourceUri,
  blobResourceUri,
  blobResource,
  RESOURCE_TYPE_TEXT
} from '../resources/templates'

export function registerEmbeddedResourcePrompt(server: McpServer): void {
  server.registerPrompt(
    'resource-prompt',
    {
      title: 'Resource Prompt',
      description: 'A prompt that includes an embedded resource reference. Demo/test fixture.',
      argsSchema: {
        resourceType: resourceTypeCompleter,
        resourceId: resourceIdForPromptCompleter
      }
    },
    (args) => {
      const resourceId = Number(args.resourceId)
      if (!Number.isFinite(resourceId) || !Number.isInteger(resourceId) || resourceId < 1) {
        throw new Error(`Invalid resourceId: ${args.resourceId}. Must be a finite positive integer.`)
      }

      const uri =
        args.resourceType === RESOURCE_TYPE_TEXT ? textResourceUri(resourceId) : blobResourceUri(resourceId)
      const resource =
        args.resourceType === RESOURCE_TYPE_TEXT
          ? textResource(uri, resourceId)
          : blobResource(uri, resourceId)

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `This prompt includes the ${args.resourceType} resource with id: ${resourceId}. Please analyze the following resource:`
            }
          },
          { role: 'user', content: { type: 'resource', resource } }
        ]
      }
    }
  )
}
