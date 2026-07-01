import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('resources/index', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('loads real server instructions from docs/instructions.md, not the fallback error text', async () => {
    testClient = await connectTestClient()
    const instructions = testClient.client.getInstructions()
    expect(instructions).toContain('Instructions')
    expect(instructions).not.toContain('Server instructions not loaded')
  })
})
