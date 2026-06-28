import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { ServerConfig } from '../../shared/mcp.types'
import type { Session } from './types'
import { createTransport } from './transportFactory'
import { buildOAuthTransport, authorizeAndConnect, emitAuth } from './oauthHandshake'
import { wireSession } from './sessionWiring'

// Live sessions keyed by server ID. The value is the connection *promise*, not
// the resolved session, so concurrent first-callers share one spawn instead of
// racing to create duplicate processes.
const sessions = new Map<string, Promise<Session>>()

// Resolves a map entry to its session, treating a failed connection as absent.
async function resolveSession(entry: Promise<Session> | undefined): Promise<Session | null> {
  if (!entry) return null
  return entry.catch(() => null)
}

// Returns the warm session for a server, spawning and wiring one on first use.
// Subsequent calls reuse the same process until it dies or is disconnected.
export function getSession(config: ServerConfig): Promise<Session> {
  const existing = sessions.get(config.id)
  if (existing) return existing

  const pending = createSession(config)
  sessions.set(config.id, pending)
  // A failed connection must not stay cached, or every later call would reuse
  // the rejected promise instead of retrying the spawn.
  pending.catch(() => {
    if (sessions.get(config.id) === pending) sessions.delete(config.id)
  })
  return pending
}

async function createSession(config: ServerConfig): Promise<Session> {
  const client = new Client(
    { name: 'mcpflo', version: '1.0.0' },
    {
      capabilities: {
        sampling: {},
        elicitation: {},
        // roots intentionally not advertised in v1 — MCPFlo has no UI to
        // configure them yet, so claiming support would leave servers calling
        // roots/list and getting an empty list. Revisit in v2.
        tasks: {
          requests: {
            sampling: { createMessage: {} },
            elicitation: { create: {} }
          }
        }
      },
      // Backs task-augmented requests (e.g. async elicitation): the SDK serves
      // tasks/get, tasks/result and tasks/cancel from this store. Per-session
      // and in-memory — task state lives as long as the connection does.
      taskStore: new InMemoryTaskStore()
    }
  )

  // OAuth-mode streamable-http routes through the auth-aware handshake; every
  // other transport connects directly. createTransport stays synchronous — only
  // the OAuth branch needs async setup (loopback bind).
  const t = config.transport
  let transport: Transport
  if (t.type === 'streamable-http' && t.auth === 'oauth') {
    const built = await buildOAuthTransport(config)
    transport = await authorizeAndConnect(config, client, built.makeTransport, built.loopback)
  } else {
    transport = createTransport(config)
    await client.connect(transport, { timeout: config.overrides?.timeoutMs })
  }

  const session: Session = { client, transport, active: null, queue: Promise.resolve() }

  // When the process dies, drop the session so the next call respawns a fresh
  // one instead of reusing a dead handle.
  client.onclose = (): void => {
    const entry = sessions.get(config.id)
    void resolveSession(entry).then((resolved) => {
      if (resolved === session && sessions.get(config.id) === entry) sessions.delete(config.id)
    })
  }

  wireSession(client, transport, session)

  return session
}

// Tears down a session left unusable by an UnauthorizedError mid-operation and
// flips the renderer into auth_required so the re-auth affordance appears.
export function handleOperationAuthError(serverId: string): void {
  void disconnectServer(serverId)
  emitAuth({ type: 'auth_required', serverId })
}

export async function disconnectServer(id: string): Promise<void> {
  const entry = sessions.get(id)
  if (!entry) return
  // Delete first so the onclose hook (which also deletes) is a no-op and a
  // concurrent getSession can't hand back a closing connection.
  sessions.delete(id)
  const session = await resolveSession(entry)
  if (session) await session.client.close().catch(() => {})
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...sessions.keys()].map(disconnectServer))
}
