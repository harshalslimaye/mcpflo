import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('args-prompt', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('lists city as required and state as optional, both with descriptions', async () => {
    testClient = await connectTestClient()
    const { prompts } = await testClient.client.listPrompts()
    const prompt = prompts.find((p) => p.name === 'args-prompt')
    expect(prompt?.arguments).toEqual([
      { name: 'city', description: 'Name of the city', required: true },
      { name: 'state', description: 'Name of the state', required: false }
    ])
  })

  it('combines city and state when both are given', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.getPrompt({ name: 'args-prompt', arguments: { city: 'Austin', state: 'Texas' } })
    expect((result.messages[0].content as { text: string }).text).toBe("What's weather in Austin, Texas?")
  })

  it('omits the state suffix when only city is given', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.getPrompt({ name: 'args-prompt', arguments: { city: 'Austin' } })
    expect((result.messages[0].content as { text: string }).text).toBe("What's weather in Austin?")
  })

  it('rejects a call missing the required city argument', async () => {
    testClient = await connectTestClient()
    await expect(
      testClient.client.getPrompt({ name: 'args-prompt', arguments: { state: 'Texas' } })
    ).rejects.toThrow()
  })
})
