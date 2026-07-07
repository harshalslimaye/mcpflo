import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const ENCODINGS = ['utf-8', 'base64'] as const

const sourceSelectorSchema = z.discriminatedUnion('sourceType', [
  z.object({
    sourceType: z.literal('git'),
    repoUrl: z.url().describe('Git repository URL'),
    ref: z.string().default('main').describe('Branch, tag, or commit reference'),
    shallow: z.boolean().default(true).describe('Whether to use shallow clone mode')
  }),
  z.object({
    sourceType: z.literal('url'),
    url: z.url().describe('HTTP(S) URL to fetch from'),
    followRedirects: z.boolean().default(true),
    authHeader: z.string().optional().describe('Optional Authorization header value')
  }),
  z.object({
    sourceType: z.literal('localFile'),
    filePath: z.string().describe('Absolute file path on the local machine'),
    encoding: z.enum(ENCODINGS).default('utf-8')
  })
])

export function registerSourceSelectorOneof(server: McpServer): void {
  server.registerTool(
    'source-selector-oneof',
    {
      description:
        'Selects exactly one source configuration branch (git/url/localFile) to stress-test oneOf/discriminated-union form rendering. Demo/test fixture.',
      inputSchema: {
        source: sourceSelectorSchema.describe('Choose exactly one source variant'),
        includeGlobs: z.array(z.string()).optional().describe('Optional include globs to limit discovered files'),
        maxFiles: z.number().int().min(1).max(10000).default(200)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ source, includeGlobs, maxFiles }): Promise<CallToolResult> => {
      const includeSummary = includeGlobs && includeGlobs.length > 0 ? includeGlobs.join(', ') : '(none)'

      let sourceSummary: string
      if (source.sourceType === 'git') {
        sourceSummary = `git repo=${source.repoUrl} ref=${source.ref} shallow=${source.shallow}`
      } else if (source.sourceType === 'url') {
        sourceSummary = `url target=${source.url} followRedirects=${source.followRedirects} auth=${Boolean(source.authHeader)}`
      } else {
        sourceSummary = `localFile path=${source.filePath} encoding=${source.encoding}`
      }

      const text = [
        `Source branch: ${source.sourceType}`,
        `Resolved source: ${sourceSummary}`,
        `Include globs: ${includeSummary}`,
        `Max files: ${maxFiles}`
      ].join('\n')

      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          source,
          includeGlobs: includeGlobs ?? [],
          maxFiles
        }
      }
    }
  )
}
