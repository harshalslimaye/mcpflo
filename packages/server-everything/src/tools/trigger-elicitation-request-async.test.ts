import { describe, it, expect, afterEach } from 'vitest'
import { ElicitRequestSchema, GetTaskRequestSchema, GetTaskPayloadRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { connectTestClient, type TestClient } from '../test/harness'

function taskShape(status: string, statusMessage: string): Record<string, unknown> {
  return {
    taskId: 'client-task-1',
    status,
    ttl: 600000,
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    statusMessage
  }
}

describe('trigger-elicitation-request-async', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('is not registered for a client without elicitation support', async () => {
    testClient = await connectTestClient()
    const { tools } = await testClient.client.listTools()
    expect(tools.map((t) => t.name)).not.toContain('trigger-elicitation-request-async')
  })

  it('polls a client-managed task to completion and reports the result', async () => {
    testClient = await connectTestClient({
      elicitation: {},
      tasks: { requests: { elicitation: { create: {} } } }
    })

    let pollCount = 0
    let receivedTask: unknown
    testClient.client.setRequestHandler(ElicitRequestSchema, async (request) => {
      receivedTask = request.params.task
      return { task: taskShape('input_required', 'waiting on user') }
    })
    testClient.client.setRequestHandler(GetTaskRequestSchema, async () => {
      pollCount++
      return pollCount >= 2 ? taskShape('completed', 'done') : taskShape('input_required', 'waiting')
    })
    testClient.client.setRequestHandler(GetTaskPayloadRequestSchema, async () => ({
      action: 'accept',
      content: { name: 'Ada', favoriteColor: 'Blue', agreeToTerms: true }
    }))

    const result = await testClient.client.callTool({ name: 'trigger-elicitation-request-async', arguments: {} })
    const text = (result.content as Array<{ text: string }>).map((b) => b.text).join('\n')

    expect(receivedTask).toEqual({ ttl: 600000 })
    expect(pollCount).toBeGreaterThanOrEqual(2)
    expect(text).toContain('[COMPLETED]')
    expect(text).toContain('Ada')
    expect(text).toContain('Blue')
  })
})
