import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('add', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('adds two numbers', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({ name: 'add', arguments: { a: 4, b: 5 } })
    expect(result.content).toEqual([{ type: 'text', text: '4 + 5 = 9' }])
  })
})
