import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { LoggingLevel } from '@modelcontextprotocol/sdk/types.js'

// RFC 5424 severity, lowest number = most severe.
const LEVEL_SEVERITY: Record<LoggingLevel, number> = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7
}

const RANDOM_LEVELS: LoggingLevel[] = Object.keys(LEVEL_SEVERITY) as LoggingLevel[]
const INTERVAL_MS = 5000

const sessionLevels = new Map<string | undefined, LoggingLevel>()
const sessionTimers = new Map<string | undefined, NodeJS.Timeout>()

export function registerLoggingCapability(server: McpServer): void {
  server.server.setRequestHandler(SetLevelRequestSchema, async (request, extra) => {
    sessionLevels.set(extra.sessionId, request.params.level)
    return {}
  })
}

export function beginSimulatedLogging(server: McpServer, sessionId: string | undefined): void {
  const timer = setInterval(() => {
    const level = RANDOM_LEVELS[Math.floor(Math.random() * RANDOM_LEVELS.length)]
    const minLevel = sessionLevels.get(sessionId) ?? 'debug'
    if (LEVEL_SEVERITY[level] > LEVEL_SEVERITY[minLevel]) return

    server.server
      .sendLoggingMessage(
        { level, logger: 'simulated-logging', data: `Simulated ${level} message at ${new Date().toISOString()}` },
        sessionId
      )
      .catch(() => {})
  }, INTERVAL_MS)
  sessionTimers.set(sessionId, timer)
}

export function stopSimulatedLogging(sessionId: string | undefined): void {
  const timer = sessionTimers.get(sessionId)
  if (timer) clearInterval(timer)
  sessionTimers.delete(sessionId)
}
