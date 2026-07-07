import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const TAG_FILTER = z.object({
  type: z.literal('tag'),
  field: z.string().describe('Tag field name, e.g. category or owner'),
  values: z.array(z.string()).min(1).describe('Tag values to include/exclude'),
  mode: z.enum(['include', 'exclude']).default('include')
})

const DATE_RANGE_FILTER = z.object({
  type: z.literal('dateRange'),
  field: z.string().describe('Date field name'),
  from: z.string().describe('Start date/time (ISO-like string)'),
  to: z.string().describe('End date/time (ISO-like string)'),
  timezone: z.string().default('UTC')
})

const THRESHOLD_FILTER = z.object({
  type: z.literal('threshold'),
  field: z.string().describe('Numeric field name'),
  op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
  value: z.number().describe('Comparison value')
})

const FILTER_UNION = z.union([TAG_FILTER, DATE_RANGE_FILTER, THRESHOLD_FILTER])

export function registerFiltersAnyofArray(server: McpServer): void {
  server.registerTool(
    'filters-anyof-array',
    {
      description:
        'Accepts a mixed array of filter variants (tag/dateRange/threshold) to stress-test array items rendered from anyOf-style unions. Demo/test fixture.',
      inputSchema: {
        filters: z
          .array(FILTER_UNION)
          .min(1)
          .describe('Ordered filter list where each item can be one of three shapes'),
        combineWith: z
          .enum(['and', 'or'])
          .default('and')
          .describe('How individual filters are combined'),
        limit: z.number().int().min(1).max(1000).default(100)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ filters, combineWith, limit }): Promise<CallToolResult> => {
      const counts = { tag: 0, dateRange: 0, threshold: 0 }
      const lines: string[] = []

      for (const filter of filters) {
        counts[filter.type] += 1
        if (filter.type === 'tag') {
          lines.push(`- tag ${filter.field} ${filter.mode} [${filter.values.join(', ')}]`)
        } else if (filter.type === 'dateRange') {
          lines.push(
            `- dateRange ${filter.field} ${filter.from}..${filter.to} tz=${filter.timezone}`
          )
        } else {
          lines.push(`- threshold ${filter.field} ${filter.op} ${filter.value}`)
        }
      }

      const text = [
        `Filter count: ${filters.length}`,
        `Combine with: ${combineWith}`,
        `Limit: ${limit}`,
        `By type: tag=${counts.tag}, dateRange=${counts.dateRange}, threshold=${counts.threshold}`,
        'Filters:',
        ...lines
      ].join('\n')

      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          filters,
          combineWith,
          limit,
          counts
        }
      }
    }
  )
}
