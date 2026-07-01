import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('get-structured-content', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('returns structured content matching the text block for a known city', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'get-structured-content',
      arguments: { location: 'Chicago' }
    })
    expect(result.structuredContent).toEqual({ temperature: 36, conditions: 'Light rain / drizzle', humidity: 82 })
    const blocks = result.content as Array<{ type: string; text: string }>
    expect(JSON.parse(blocks[0].text)).toEqual(result.structuredContent)
  })

  it('rejects an unknown city', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'get-structured-content',
      arguments: { location: 'Nowhere' }
    })
    expect(result.isError).toBe(true)
  })
})
