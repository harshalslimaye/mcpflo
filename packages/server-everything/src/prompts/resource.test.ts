import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('resource-prompt', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('narrows resourceType completions to blob on "b"', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.complete({
      ref: { type: 'ref/prompt', name: 'resource-prompt' },
      argument: { name: 'resourceType', value: 'b' }
    })
    expect(result.completion.values).toEqual(['blob'])
  })

  it('embeds the requested blob resource in the prompt messages', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.getPrompt({
      name: 'resource-prompt',
      arguments: { resourceType: 'blob', resourceId: '4' }
    })
    expect(result.messages).toHaveLength(2)
    expect((result.messages[0].content as { text: string }).text).toContain('blob resource with id: 4')
    const resourceBlock = result.messages[1].content as { type: string; resource: { uri: string; blob: string } }
    expect(resourceBlock.resource.uri).toBe('mcpflo://static/resource/blob/4')
    expect(Buffer.from(resourceBlock.resource.blob, 'base64').toString()).toContain('Resource 4')
  })

  it('rejects a non-numeric resourceId', async () => {
    testClient = await connectTestClient()
    await expect(
      testClient.client.getPrompt({ name: 'resource-prompt', arguments: { resourceType: 'text', resourceId: 'abc' } })
    ).rejects.toThrow()
  })
})
