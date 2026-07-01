import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('get-resource-links', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('defaults to 3 alternating resource links', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({ name: 'get-resource-links', arguments: {} })
    const blocks = result.content as Array<{ type: string; uri?: string; mimeType?: string }>
    const links = blocks.filter((b) => b.type === 'resource_link')
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.mimeType)).toEqual([
      'application/octet-stream',
      'text/plain',
      'application/octet-stream'
    ])
  })

  it('rejects a count above the max of 10', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({ name: 'get-resource-links', arguments: { count: 11 } })
    expect(result.isError).toBe(true)
  })
})
