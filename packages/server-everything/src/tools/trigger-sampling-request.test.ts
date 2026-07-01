import { describe, it, expect, afterEach } from 'vitest'
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { connectTestClient, type TestClient } from '../test/harness'

describe('trigger-sampling-request', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('is not registered for a client without sampling support', async () => {
    testClient = await connectTestClient()
    const { tools } = await testClient.client.listTools()
    expect(tools.map((t) => t.name)).not.toContain('trigger-sampling-request')
  })

  it('forwards the prompt cleanly and returns the sampling result', async () => {
    testClient = await connectTestClient({ sampling: {} })

    let receivedPrompt = ''
    testClient.client.setRequestHandler(CreateMessageRequestSchema, async (request) => {
      receivedPrompt = (request.params.messages[0].content as { text: string }).text
      return { role: 'assistant', content: { type: 'text', text: '42' }, model: 'test-model', stopReason: 'endTurn' }
    })

    const result = await testClient.client.callTool({
      name: 'trigger-sampling-request',
      arguments: { prompt: 'What is 6*7?' }
    })

    expect(receivedPrompt).toBe('What is 6*7?')
    expect((result.content as Array<{ text: string }>)[0].text).toContain('"text": "42"')
  })
})
