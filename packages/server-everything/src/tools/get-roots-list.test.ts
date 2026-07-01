import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { TestClient } from '../test/harness'

describe('get-roots-list', () => {
  let testClient: TestClient

  // src/server/roots.ts caches the client's roots list in a module-level Map
  // keyed by sessionId — always undefined for our stdio-only server. Across
  // separate real process launches that's invisible (fresh module each
  // time), but multiple test cases in one process share that module state
  // and would collide without a full module reset per test.
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(async () => {
    await testClient?.close()
  })

  it('is not registered for a client that does not declare roots support', async () => {
    const { connectTestClient } = await import('../test/harness')
    testClient = await connectTestClient()
    const { tools } = await testClient.client.listTools()
    expect(tools.map((t) => t.name)).not.toContain('get-roots-list')
  })

  it('reports no roots configured when the client returns an empty list', async () => {
    const { connectTestClient } = await import('../test/harness')
    testClient = await connectTestClient({ roots: {} })
    testClient.client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: [] }))

    const result = await testClient.client.callTool({ name: 'get-roots-list', arguments: {} })
    const blocks = result.content as Array<{ type: string; text: string }>
    expect(blocks[0].text).toContain('no roots are currently configured')
  })

  it('lists the roots the client provides, and re-syncs after list_changed', async () => {
    const { connectTestClient } = await import('../test/harness')
    testClient = await connectTestClient({ roots: { listChanged: true } })
    let roots = [{ uri: 'file:///Users/dev/project-a', name: 'Project A' }]
    testClient.client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots }))

    const first = await testClient.client.callTool({ name: 'get-roots-list', arguments: {} })
    const firstText = (first.content as Array<{ text: string }>)[0].text
    expect(firstText).toContain('Current MCP Roots (1 total)')
    expect(firstText).toContain('Project A')

    roots = [
      { uri: 'file:///Users/dev/project-b', name: 'Project B' },
      { uri: 'file:///Users/dev/project-c' }
    ]
    await testClient.client.notification({ method: 'notifications/roots/list_changed' })
    // Let the server's notification handler run before calling the tool again.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const second = await testClient.client.callTool({ name: 'get-roots-list', arguments: {} })
    const secondText = (second.content as Array<{ text: string }>)[0].text
    expect(secondText).toContain('Current MCP Roots (2 total)')
    expect(secondText).toContain('Project B')
    expect(secondText).toContain('Unnamed Root')
  })
})
