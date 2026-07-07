import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('untyped-payload-and-map', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('registers with untyped payload and map-style fields', async () => {
    testClient = await connectTestClient()

    const { tools } = await testClient.client.listTools()
    const tool = tools.find((t) => t.name === 'untyped-payload-and-map')

    expect(tool).toBeDefined()
    expect(tool?.inputSchema?.type).toBe('object')

    const properties = tool?.inputSchema?.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(['payload', 'labels', 'options', 'strict'])
    )

    const labels = properties.labels as { type?: string; additionalProperties?: unknown }
    expect(labels.type).toBe('object')
    expect(labels.additionalProperties).toBeDefined()
  })

  it('accepts object payload and map fields', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'untyped-payload-and-map',
      arguments: {
        payload: { userId: 42, tags: ['alpha', 'beta'], nested: { active: true } },
        labels: { env: 'prod', team: 'platform' },
        options: { retries: 3, dryRun: true, mode: 'safe' },
        strict: true
      }
    })

    expect(result.isError).not.toBe(true)

    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Payload type: object')
    expect(text).toContain('Strict mode: true')
    expect(text).toContain('Label count: 2')
    expect(text).toContain('Option count: 3')
  })

  it('applies defaults when optional map fields are omitted', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'untyped-payload-and-map',
      arguments: {
        payload: ['a', 'b', 'c']
      }
    })

    expect(result.isError).not.toBe(true)

    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Payload type: array')
    expect(text).toContain('Strict mode: false')
    expect(text).toContain('Label count: 0')
    expect(text).toContain('Option count: 0')
  })

  it('rejects non-string label values', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'untyped-payload-and-map',
      arguments: {
        payload: { id: 1 },
        labels: { env: 1 }
      }
    })

    expect(result.isError).toBe(true)
  })
})
