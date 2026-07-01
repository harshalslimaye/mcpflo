import { describe, it, expect, afterEach } from 'vitest'
import { ElicitRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { connectTestClient, type TestClient } from '../test/harness'

describe('trigger-url-elicitation', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('is not registered for a client without elicitation.url support', async () => {
    testClient = await connectTestClient({ elicitation: {} })
    const { tools } = await testClient.client.listTools()
    expect(tools.map((t) => t.name)).not.toContain('trigger-url-elicitation')
  })

  it('sends a URL elicitation request on the request path and reports acceptance', async () => {
    testClient = await connectTestClient({ elicitation: { url: {} } })
    let requestedUrl = ''
    testClient.client.setRequestHandler(ElicitRequestSchema, async (request) => {
      requestedUrl = (request.params as { url: string }).url
      return { action: 'accept' }
    })

    const result = await testClient.client.callTool({
      name: 'trigger-url-elicitation',
      arguments: { url: 'https://example.com/auth' }
    })

    expect(requestedUrl).toBe('https://example.com/auth')
    expect((result.content as Array<{ text: string }>)[0].text).toContain('completed the URL elicitation flow')
  })

  it('throws -32042 on the error path with a prerequisite pointing at a different URL, then falls through on retry', async () => {
    testClient = await connectTestClient({ elicitation: { url: {} } })
    let requestedUrl = ''
    testClient.client.setRequestHandler(ElicitRequestSchema, async (request) => {
      requestedUrl = (request.params as { url: string }).url
      return { action: 'accept' }
    })

    let threw: unknown
    try {
      await testClient.client.callTool({
        name: 'trigger-url-elicitation',
        arguments: { url: 'https://example.com/auth', errorPath: true }
      })
    } catch (error) {
      threw = error
    }

    expect(threw).toBeInstanceOf(McpError)
    expect((threw as McpError).code).toBe(-32042)
    const prerequisiteUrl = ((threw as McpError).data as { elicitations: Array<{ url: string }> }).elicitations[0].url
    expect(prerequisiteUrl).not.toBe('https://example.com/auth')

    // Client "satisfies the prerequisite" and retries with the SAME arguments.
    const retryResult = await testClient.client.callTool({
      name: 'trigger-url-elicitation',
      arguments: { url: 'https://example.com/auth', errorPath: true }
    })

    expect(requestedUrl).toBe('https://example.com/auth')
    expect((retryResult.content as Array<{ text: string }>)[0].text).toContain('completed the URL elicitation flow')
  })
})
