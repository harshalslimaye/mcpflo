import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('print-env', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('dumps the server process environment as JSON', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({ name: 'print-env', arguments: {} })
    const block = result.content as Array<{ type: string; text: string }>
    const parsed = JSON.parse(block[0].text)
    expect(parsed).toEqual(process.env)
  })
})
