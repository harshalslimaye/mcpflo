import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('simple-prompt', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('is listed with no arguments', async () => {
    testClient = await connectTestClient()
    const { prompts } = await testClient.client.listPrompts()
    const prompt = prompts.find((p) => p.name === 'simple-prompt')
    expect(prompt?.arguments ?? []).toHaveLength(0)
  })

  it('returns the fixed message with no arguments', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.getPrompt({ name: 'simple-prompt' })
    expect(result.messages).toEqual([
      { role: 'user', content: { type: 'text', text: 'This is a simple prompt without arguments.' } }
    ])
  })
})
