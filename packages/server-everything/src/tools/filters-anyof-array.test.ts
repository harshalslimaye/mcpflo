import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('filters-anyof-array', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('registers and exposes array items as union branches', async () => {
    testClient = await connectTestClient()

    const { tools } = await testClient.client.listTools()
    const tool = tools.find((t) => t.name === 'filters-anyof-array')

    expect(tool).toBeDefined()
    expect(tool?.inputSchema?.type).toBe('object')

    const properties = tool?.inputSchema?.properties as Record<string, unknown>
    const filtersProp = properties.filters as {
      type?: string
      items?: { oneOf?: unknown[]; anyOf?: unknown[] }
    }

    expect(filtersProp.type).toBe('array')
    const branches = filtersProp.items?.anyOf ?? filtersProp.items?.oneOf ?? []
    expect(branches).toHaveLength(3)
  })

  it('accepts a mixed filter array and returns branch summaries', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'filters-anyof-array',
      arguments: {
        filters: [
          {
            type: 'tag',
            field: 'category',
            values: ['tech', 'science'],
            mode: 'include'
          },
          {
            type: 'dateRange',
            field: 'publishedAt',
            from: '2026-01-01T00:00:00Z',
            to: '2026-06-30T23:59:59Z'
          },
          {
            type: 'threshold',
            field: 'score',
            op: 'gte',
            value: 0.9
          }
        ],
        combineWith: 'and',
        limit: 25
      }
    })

    expect(result.isError).not.toBe(true)

    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Filter count: 3')
    expect(text).toContain('Combine with: and')
    expect(text).toContain('By type: tag=1, dateRange=1, threshold=1')
    expect(text).toContain('- tag category include [tech, science]')
    expect(text).toContain('- threshold score gte 0.9')
  })

  it('uses defaults when optional top-level fields are omitted', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'filters-anyof-array',
      arguments: {
        filters: [
          {
            type: 'threshold',
            field: 'priority',
            op: 'gt',
            value: 10
          }
        ]
      }
    })

    expect(result.isError).not.toBe(true)
    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Combine with: and')
    expect(text).toContain('Limit: 100')
  })

  it('rejects invalid filter arrays', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'filters-anyof-array',
      arguments: {
        filters: []
      }
    })

    expect(result.isError).toBe(true)
  })
})
