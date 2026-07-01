import { describe, it, expect, afterEach } from 'vitest'
import { CreateMessageRequestSchema, GetTaskRequestSchema, GetTaskPayloadRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { connectTestClient, type TestClient } from '../test/harness'

function taskShape(status: string, statusMessage: string): Record<string, unknown> {
  return {
    taskId: 'sample-task-1',
    status,
    ttl: 300000,
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    statusMessage
  }
}

describe('trigger-sampling-request-async', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('is not registered for a client without sampling support', async () => {
    testClient = await connectTestClient()
    const { tools } = await testClient.client.listTools()
    expect(tools.map((t) => t.name)).not.toContain('trigger-sampling-request-async')
  })

  it('polls a client-managed task to completion and reports the sampling result', async () => {
    testClient = await connectTestClient({
      sampling: {},
      tasks: { requests: { sampling: { createMessage: {} } } }
    })

    let pollCount = 0
    let receivedPrompt = ''
    testClient.client.setRequestHandler(CreateMessageRequestSchema, async (request) => {
      receivedPrompt = (request.params.messages[0].content as { text: string }).text
      return { task: taskShape('working', 'generating...') }
    })
    testClient.client.setRequestHandler(GetTaskRequestSchema, async () => {
      pollCount++
      return pollCount >= 2 ? taskShape('completed', 'generation done') : taskShape('working', 'generating...')
    })
    testClient.client.setRequestHandler(GetTaskPayloadRequestSchema, async () => ({
      role: 'assistant',
      content: { type: 'text', text: 'The capital of France is Paris.' },
      model: 'test-model',
      stopReason: 'endTurn'
    }))

    const result = await testClient.client.callTool({
      name: 'trigger-sampling-request-async',
      arguments: { prompt: 'What is the capital of France?' }
    })
    const text = (result.content as Array<{ text: string }>).map((b) => b.text).join('\n')

    expect(receivedPrompt).toBe('What is the capital of France?')
    expect(pollCount).toBeGreaterThanOrEqual(2)
    expect(text).toContain('[COMPLETED]')
    expect(text).toContain('Paris')
  })
})
