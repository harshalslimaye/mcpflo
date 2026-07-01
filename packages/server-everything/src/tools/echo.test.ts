import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('echo', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('echoes the message back', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({ name: 'echo', arguments: { message: 'hello' } })
    expect(result.content).toEqual([{ type: 'text', text: 'Echo: hello' }])
  })
})
