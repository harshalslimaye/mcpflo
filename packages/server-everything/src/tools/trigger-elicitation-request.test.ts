import { describe, it, expect, afterEach } from 'vitest'
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { connectTestClient, type TestClient } from '../test/harness'

describe('trigger-elicitation-request', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('is not registered for a client without elicitation support', async () => {
    testClient = await connectTestClient()
    const { tools } = await testClient.client.listTools()
    expect(tools.map((t) => t.name)).not.toContain('trigger-elicitation-request')
  })

  it('sends every schema field to the client and reports all of them back', async () => {
    testClient = await connectTestClient({ elicitation: {} })

    let receivedFieldCount = 0
    testClient.client.setRequestHandler(ElicitRequestSchema, async (request) => {
      receivedFieldCount = Object.keys(request.params.requestedSchema.properties).length
      return {
        action: 'accept',
        content: {
          name: 'Ada Lovelace',
          check: true,
          firstLine: 'Call me Ishmael.',
          email: 'ada@example.com',
          homepage: 'https://ada.example.com',
          birthdate: '1815-12-10',
          integer: 7,
          number: 2.71,
          untitledSingleSelectEnum: 'Rachel',
          untitledMultipleSelectEnum: ['Guitar', 'Piano'],
          titledSingleSelectEnum: 'hero-2',
          titledMultipleSelectEnum: ['fish-2'],
          legacyTitledEnum: 'pet-3'
        }
      }
    })

    const result = await testClient.client.callTool({ name: 'trigger-elicitation-request', arguments: {} })
    expect(receivedFieldCount).toBe(13)

    const summary = (result.content as Array<{ text: string }>).map((b) => b.text).join('\n')
    for (const value of [
      'Ada Lovelace',
      'Call me Ishmael.',
      'ada@example.com',
      'https://ada.example.com',
      '1815-12-10',
      'Rachel',
      'hero-2',
      'fish-2',
      'pet-3'
    ]) {
      expect(summary).toContain(value)
    }
  })

  it('reports a decline', async () => {
    testClient = await connectTestClient({ elicitation: {} })
    testClient.client.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'decline' }))

    const result = await testClient.client.callTool({ name: 'trigger-elicitation-request', arguments: {} })
    expect((result.content as Array<{ text: string }>)[0].text).toContain('declined')
  })
})
