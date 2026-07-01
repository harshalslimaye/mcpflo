import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Root } from '@modelcontextprotocol/sdk/types.js'
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

// Track roots by session id. stdio is single-session (sessionId always
// undefined), so setNotificationHandler below only ever gets called once for
// the life of the process — if this server ever grew a multi-session
// transport, the notification handler would need per-session dispatch
// instead of relying on setNotificationHandler's single global registration.
const roots = new Map<string | undefined, Root[]>()

/**
 * Gets the latest client roots list for the session, requesting and caching
 * it on first use, then keeping the cache fresh via roots/list_changed.
 * Idempotent: only requests roots from the client once per session.
 */
export async function syncRoots(server: McpServer, sessionId: string | undefined): Promise<Root[] | undefined> {
  const clientCapabilities = server.server.getClientCapabilities() ?? {}
  if (clientCapabilities.roots === undefined) return undefined

  const requestRoots = async (): Promise<void> => {
    try {
      const response = await server.server.listRoots()
      if (response && 'roots' in response) {
        roots.set(sessionId, response.roots)
        await server.sendLoggingMessage(
          {
            level: 'info',
            logger: 'everything-server',
            data: `Roots updated: ${response.roots.length} root(s) received from client`
          },
          sessionId
        )
      } else {
        await server.sendLoggingMessage(
          { level: 'info', logger: 'everything-server', data: 'Client returned no roots set' },
          sessionId
        )
      }
    } catch (error) {
      console.error(`Failed to request roots from client ${sessionId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!roots.has(sessionId)) {
    server.server.setNotificationHandler(RootsListChangedNotificationSchema, requestRoots)
    await requestRoots()
  }

  return roots.get(sessionId)
}
