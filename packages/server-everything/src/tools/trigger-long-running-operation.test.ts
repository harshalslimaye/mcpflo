import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('trigger-long-running-operation', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('emits one progress notification per step and completes with a summary', async () => {
    testClient = await connectTestClient()
    const progressUpdates: Array<{ progress: number; total?: number }> = []

    const result = await testClient.client.callTool(
      { name: 'trigger-long-running-operation', arguments: { duration: 0.2, steps: 4 } },
      undefined,
      { onprogress: (p) => progressUpdates.push(p) }
    )

    expect(progressUpdates.map((p) => p.progress)).toEqual([1, 2, 3, 4])
    expect(progressUpdates.every((p) => p.total === 4)).toBe(true)
    expect(result.content).toEqual([
      { type: 'text', text: 'Long running operation completed. Duration: 0.2 seconds, Steps: 4.' }
    ])
  })
})
