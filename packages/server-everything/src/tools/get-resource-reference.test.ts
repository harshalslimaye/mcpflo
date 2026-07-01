import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('get-resource-reference', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('defaults to a text resource with id 1', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({ name: 'get-resource-reference', arguments: {} })
    const blocks = result.content as Array<{ type: string; resource?: { uri: string; text?: string } }>
    expect(blocks[1].resource?.uri).toBe('mcpflo://static/resource/text/1')
  })

  it('returns a blob resource for a given id', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'get-resource-reference',
      arguments: { resourceType: 'blob', resourceId: 7 }
    })
    const blocks = result.content as Array<{ type: string; resource?: { uri: string; blob?: string } }>
    expect(blocks[1].resource?.uri).toBe('mcpflo://static/resource/blob/7')
    expect(Buffer.from(blocks[1].resource?.blob as string, 'base64').toString()).toContain('Resource 7')
  })

  it('rejects a non-positive resourceId', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'get-resource-reference',
      arguments: { resourceType: 'text', resourceId: -1 }
    })
    expect(result.isError).toBe(true)
  })
})
