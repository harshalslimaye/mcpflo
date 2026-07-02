import type { Client } from '@modelcontextprotocol/sdk/client/index.js'

// The SDK's Client.connect() hardcodes LATEST_PROTOCOL_VERSION into the
// initialize request with no option to ask for anything else, so the requested
// revision is pinned by intercepting the client's own request() — one seam that
// covers every transport path (stdio, plain streamable-http, and the OAuth
// handshake's reconnects alike). The rewrite depends only on the spec-defined
// initialize message shape, not on SDK internals; session.test.ts and the
// shared protocolVersions sync test guard against SDK upgrades shifting
// underneath it.
export function pinRequestedProtocolVersion(client: Client, version: string): void {
  const original = client.request.bind(client)
  const pinned: Client['request'] = (request, resultSchema, options) => {
    const outgoing =
      request.method === 'initialize'
        ? { ...request, params: { ...request.params, protocolVersion: version } }
        : request
    return original(outgoing, resultSchema, options)
  }
  client.request = pinned
}
