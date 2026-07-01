import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { connectTestClient, type TestClient } from '../test/harness'

describe('toggle-subscriber-updates', () => {
  let testClient: TestClient

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await testClient?.close()
  })

  it('notifies only subscribed URIs, and stops after unsubscribe/toggle off', async () => {
    testClient = await connectTestClient()
    const updatedUris: string[] = []
    testClient.client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (n) => {
      updatedUris.push(n.params.uri)
    })

    const uri = 'mcpflo://static/document/architecture.md'
    await testClient.client.subscribeResource({ uri })

    const startResult = await testClient.client.callTool({ name: 'toggle-subscriber-updates', arguments: {} })
    expect((startResult.content as Array<{ text: string }>)[0].text).toContain('Started simulated resource updated')

    await vi.advanceTimersByTimeAsync(11000)

    expect(updatedUris.length).toBeGreaterThanOrEqual(2)
    expect(updatedUris.every((u) => u === uri)).toBe(true)

    await testClient.client.unsubscribeResource({ uri })
    const countAfterUnsubscribe = updatedUris.length
    await vi.advanceTimersByTimeAsync(11000)
    expect(updatedUris.length).toBe(countAfterUnsubscribe)

    const stopResult = await testClient.client.callTool({ name: 'toggle-subscriber-updates', arguments: {} })
    expect((stopResult.content as Array<{ text: string }>)[0].text).toContain('Stopped simulated resource updates')
  })
})
