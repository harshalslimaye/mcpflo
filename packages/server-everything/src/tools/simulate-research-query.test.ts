import { describe, it, expect, afterEach } from 'vitest'
import { ElicitRequestSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { connectTestClient, type TestClient } from '../test/harness'

async function runToCompletion(testClient: TestClient, args: Record<string, unknown>): Promise<string> {
  const created = await testClient.client.callTool({ name: 'simulate-research-query', arguments: args, task: {} })
  const taskId = (created as unknown as { task: { taskId: string; status: string } }).task.taskId

  let status = (created as unknown as { task: { status: string } }).task.status
  while (status !== 'completed' && status !== 'failed' && status !== 'cancelled') {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const task = await testClient.client.experimental.tasks.getTask(taskId)
    status = task.status
  }

  const result = await testClient.client.experimental.tasks.getTaskResult(taskId, CallToolResultSchema)
  return (result.content as Array<{ text: string }>)[0].text
}

describe('simulate-research-query', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('always registers regardless of elicitation support', async () => {
    testClient = await connectTestClient()
    const { tools } = await testClient.client.listTools()
    expect(tools.map((t) => t.name)).toContain('simulate-research-query')
  })

  it('completes through all four stages without asking for clarification when not ambiguous', async () => {
    testClient = await connectTestClient()
    const text = await runToCompletion(testClient, { topic: 'quantum computing', ambiguous: false })
    expect(text).toContain('Stage 1: Gathering sources ✓')
    expect(text).toContain('Stage 4: Generating report ✓')
    expect(text).not.toContain('Elicitation Flow')
  }, 10000)

  it('does not ask for clarification when ambiguous but the client lacks elicitation support', async () => {
    testClient = await connectTestClient()
    const text = await runToCompletion(testClient, { topic: 'python', ambiguous: true })
    expect(text).not.toContain('Elicitation Flow')
  }, 10000)

  it('asks for clarification and resolves it when ambiguous and the client supports elicitation', async () => {
    testClient = await connectTestClient({ elicitation: {} })
    testClient.client.setRequestHandler(ElicitRequestSchema, async () => ({
      action: 'accept',
      content: { interpretation: 'programming' }
    }))

    const text = await runToCompletion(testClient, { topic: 'python', ambiguous: true })
    expect(text).toContain('Elicitation Flow')
    expect(text).toContain('programming')
  }, 10000)
})
