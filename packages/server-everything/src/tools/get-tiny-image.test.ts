import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('get-tiny-image', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('returns text/image/text content blocks with a valid PNG', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({ name: 'get-tiny-image', arguments: {} })
    const blocks = result.content as Array<{ type: string; data?: string; mimeType?: string }>

    expect(blocks.map((b) => b.type)).toEqual(['text', 'image', 'text'])

    const image = blocks[1]
    expect(image.mimeType).toBe('image/png')
    const buffer = Buffer.from(image.data as string, 'base64')
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  })
})
