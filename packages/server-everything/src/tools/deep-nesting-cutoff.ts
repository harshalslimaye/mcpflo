import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const DEEP_NESTED_SCHEMA = z.object({
  root: z.object({
    name: z.string().default('root-node'),
    children: z
      .array(
        z.object({
          id: z.string(),
          payload: z.object({
            depthMarker: z.number().int().min(0),
            config: z.object({
              retries: z.number().int().min(0).default(3),
              flags: z.array(z.boolean()).default([true]),
              labels: z.array(z.string()).default(['deep'])
            })
          })
        })
      )
      .min(1)
      .describe('At least one child node is required')
  })
})

export function registerDeepNestingCutoff(server: McpServer): void {
  server.registerTool(
    'deep-nesting-cutoff',
    {
      description:
        'Accepts intentionally deep object/array nesting to stress-test form rendering cutoff behavior for deeply nested containers. Demo/test fixture.',
      inputSchema: {
        profile: z.string().default('default-profile'),
        tree: DEEP_NESTED_SCHEMA,
        strict: z.boolean().default(false)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ profile, tree, strict }): Promise<CallToolResult> => {
      const children = tree.root.children
      const maxDepthMarker = children.reduce((max, child) => Math.max(max, child.payload.depthMarker), 0)

      const text = [
        `Profile: ${profile}`,
        `Strict mode: ${strict}`,
        `Root name: ${tree.root.name}`,
        `Child count: ${children.length}`,
        `Max depth marker: ${maxDepthMarker}`,
        'Child ids: ' + children.map((child) => child.id).join(', ')
      ].join('\n')

      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          profile,
          strict,
          tree,
          totals: {
            childCount: children.length,
            maxDepthMarker
          }
        }
      }
    }
  )
}
