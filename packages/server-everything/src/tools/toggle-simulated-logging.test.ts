import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { connectTestClient, type TestClient } from '../test/harness'

describe('toggle-simulated-logging', () => {
  let testClient: TestClient

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await testClient?.close()
  })

  it('starts and stops on alternating calls, respecting the client-selected level', async () => {
    testClient = await connectTestClient()
    const levels: string[] = []
    testClient.client.setNotificationHandler(LoggingMessageNotificationSchema, async (n) => {
      levels.push(n.params.level)
    })

    await testClient.client.setLoggingLevel('error')

    const startResult = await testClient.client.callTool({ name: 'toggle-simulated-logging', arguments: {} })
    expect((startResult.content as Array<{ text: string }>)[0].text).toContain('Started simulated')

    await vi.advanceTimersByTimeAsync(20000)

    expect(levels.length).toBeGreaterThan(0)
    expect(levels.every((l) => ['error', 'critical', 'alert', 'emergency'].includes(l))).toBe(true)

    const stopResult = await testClient.client.callTool({ name: 'toggle-simulated-logging', arguments: {} })
    expect((stopResult.content as Array<{ text: string }>)[0].text).toContain('Stopped simulated logging')

    const countAfterStop = levels.length
    await vi.advanceTimersByTimeAsync(20000)
    expect(levels.length).toBe(countAfterStop)
  })
})
