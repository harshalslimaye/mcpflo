import { describe, it, expect, vi } from 'vitest'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { pinRequestedProtocolVersion } from './protocolVersion'

// The patched request() is exercised through a hand-rolled fake rather than a
// real Client: pinning only touches the request object on its way through, so
// all that matters is what reaches the underlying method.
type RequestFn = (request: unknown, resultSchema: unknown, options?: unknown) => Promise<unknown>

function fakeClient(): { client: Client; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn<RequestFn>().mockResolvedValue('result')
  return { client: { request } as unknown as Client, request }
}

function patchedRequest(client: Client): RequestFn {
  return client.request as unknown as RequestFn
}

const initialize = {
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: { sampling: {} },
    clientInfo: { name: 'mcpflo', version: '1.0.0' }
  }
}

describe('pinRequestedProtocolVersion', () => {
  it('rewrites the protocolVersion of an initialize request, keeping the other params', async () => {
    const { client, request } = fakeClient()
    pinRequestedProtocolVersion(client, '2025-03-26')

    await patchedRequest(client)(initialize, 'schema', { timeout: 5000 })

    expect(request).toHaveBeenCalledWith(
      {
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: { sampling: {} },
          clientInfo: { name: 'mcpflo', version: '1.0.0' }
        }
      },
      'schema',
      { timeout: 5000 }
    )
  })

  it('does not mutate the caller-supplied initialize request', async () => {
    const { client } = fakeClient()
    pinRequestedProtocolVersion(client, '2025-03-26')

    await patchedRequest(client)(initialize, 'schema', undefined)

    expect(initialize.params.protocolVersion).toBe('2025-11-25')
  })

  it('passes non-initialize requests through untouched', async () => {
    const { client, request } = fakeClient()
    pinRequestedProtocolVersion(client, '2025-03-26')

    const listTools = { method: 'tools/list', params: {} }
    await patchedRequest(client)(listTools, 'schema', undefined)

    // Same object identity, not a rewritten copy.
    expect(request.mock.calls[0][0]).toBe(listTools)
  })

  it('returns the underlying result', async () => {
    const { client } = fakeClient()
    pinRequestedProtocolVersion(client, '2025-03-26')

    await expect(patchedRequest(client)(initialize, 'schema', undefined)).resolves.toBe('result')
  })
})
