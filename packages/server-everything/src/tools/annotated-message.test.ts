import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('annotated-message', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('returns a high-priority error message for both user and assistant', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'annotated-message',
      arguments: { messageType: 'error' }
    })
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Error: Operation failed',
        annotations: { priority: 1, audience: ['user', 'assistant'] }
      }
    ])
  })

  it('returns a user-facing success message', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'annotated-message',
      arguments: { messageType: 'success' }
    })
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Operation completed successfully',
        annotations: { priority: 0.7, audience: ['user'] }
      }
    ])
  })

  it('returns an assistant-facing debug message', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'annotated-message',
      arguments: { messageType: 'debug' }
    })
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Debug: Cache hit ratio 0.95, latency 150ms',
        annotations: { priority: 0.3, audience: ['assistant'] }
      }
    ])
  })

  it('includes an image block when includeImage is true', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'annotated-message',
      arguments: { messageType: 'success', includeImage: true }
    })
    const blocks = result.content as Array<{ type: string }>
    expect(blocks.map((b) => b.type)).toEqual(['text', 'image'])
  })
})
