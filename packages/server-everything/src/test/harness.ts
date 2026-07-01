import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js'
import { createServer } from '../createServer'

export interface TestClient {
  client: Client
  close: () => Promise<void>
}

// Connects a real Client to a real server instance over an in-process
// transport pair — exercises the same registration/capability-negotiation
// code path as a real stdio connection, without spawning a process.
export async function connectTestClient(capabilities: ClientCapabilities = {}): Promise<TestClient> {
  const server = createServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities })

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])

  return {
    client,
    close: async () => {
      await client.close()
      await server.close()
    }
  }
}
