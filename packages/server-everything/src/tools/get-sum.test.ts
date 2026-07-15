import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('get-sum', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('adds two numbers', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'get-sum',
      arguments: { a: 4, b: 5 }
    })
    expect(result.content).toEqual([{ type: 'text', text: 'The sum of 4 and 5 is 9.' }])
  })
})
