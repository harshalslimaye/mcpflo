import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('completable-prompt', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('narrows department completions by prefix', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.complete({
      ref: { type: 'ref/prompt', name: 'completable-prompt' },
      argument: { name: 'department', value: 'S' }
    })
    expect(result.completion.values).toEqual(['Sales', 'Support'])
  })

  it('narrows name completions based on the department context', async () => {
    testClient = await connectTestClient()
    const sales = await testClient.client.complete({
      ref: { type: 'ref/prompt', name: 'completable-prompt' },
      argument: { name: 'name', value: '' },
      context: { arguments: { department: 'Sales' } }
    })
    expect(sales.completion.values).toEqual(['David', 'Eve', 'Frank'])

    const engineering = await testClient.client.complete({
      ref: { type: 'ref/prompt', name: 'completable-prompt' },
      argument: { name: 'name', value: '' },
      context: { arguments: { department: 'Engineering' } }
    })
    expect(engineering.completion.values).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('combines the two arguments into the final prompt', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.getPrompt({
      name: 'completable-prompt',
      arguments: { department: 'Sales', name: 'Eve' }
    })
    expect((result.messages[0].content as { text: string }).text).toBe(
      'Please promote Eve to the head of the Sales team.'
    )
  })
})
