import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const INTERVAL_MS = 5000

const sessionSubscriptions = new Map<string | undefined, Set<string>>()
const sessionTimers = new Map<string | undefined, NodeJS.Timeout>()

export function registerSubscriptionsCapability(server: McpServer): void {
  server.server.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
    const uris = sessionSubscriptions.get(extra.sessionId) ?? new Set<string>()
    uris.add(request.params.uri)
    sessionSubscriptions.set(extra.sessionId, uris)
    return {}
  })

  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request, extra) => {
    sessionSubscriptions.get(extra.sessionId)?.delete(request.params.uri)
    return {}
  })
}

export function beginSimulatedResourceUpdates(server: McpServer, sessionId: string | undefined): void {
  const timer = setInterval(() => {
    const uris = sessionSubscriptions.get(sessionId)
    if (!uris || uris.size === 0) return

    for (const uri of uris) {
      server.server.sendResourceUpdated({ uri }).catch(() => {})
    }
  }, INTERVAL_MS)
  sessionTimers.set(sessionId, timer)
}

export function stopSimulatedResourceUpdates(sessionId: string | undefined): void {
  const timer = sessionTimers.get(sessionId)
  if (timer) clearInterval(timer)
  sessionTimers.delete(sessionId)
}
