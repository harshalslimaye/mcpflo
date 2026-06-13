import type { ToolCallNotification } from '../../shared/mcp.types'

// How a notification renders in the collapsed row of an expansion panel:
// a short badge (with a color class) and a one-line human summary.
export interface NotificationPresentation {
  badge: string
  badgeClass: string
  summary: string
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

// Syslog severities from the MCP logging spec, mapped to display colors.
const LEVEL_CLASSES: Record<string, string> = {
  debug: 'text-text-muted',
  info: 'text-sky-500',
  notice: 'text-sky-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
  critical: 'text-red-500',
  alert: 'text-red-500',
  emergency: 'text-red-500'
}

type Presenter = (params: Record<string, unknown>) => NotificationPresentation

const PRESENTERS: Record<string, Presenter> = {
  'notifications/progress': (params) => {
    const progress = asNumber(params.progress)
    const total = asNumber(params.total)
    const message = asString(params.message)
    const ratio =
      progress !== undefined ? (total !== undefined ? `${progress} / ${total}` : `${progress}`) : ''
    return {
      badge: 'progress',
      badgeClass: 'text-accent',
      summary: [ratio, message].filter(Boolean).join(' — ')
    }
  },

  'notifications/message': (params) => {
    const level = asString(params.level) ?? 'info'
    const logger = asString(params.logger)
    const data = params.data
    const text = typeof data === 'string' ? data : data === undefined ? '' : JSON.stringify(data)
    return {
      badge: level,
      badgeClass: LEVEL_CLASSES[level] ?? 'text-text-muted',
      summary: [logger, text].filter(Boolean).join(' · ')
    }
  },

  'notifications/resources/updated': (params) => ({
    badge: 'resource updated',
    badgeClass: 'text-sky-500',
    summary: asString(params.uri) ?? ''
  }),

  'notifications/cancelled': (params) => ({
    badge: 'cancelled',
    badgeClass: 'text-amber-500',
    summary: asString(params.reason) ?? ''
  }),

  // Synthetic entries recorded around an elicitation exchange (the wire frames
  // are requests, not notifications, so callTool emits these for visibility).
  'elicitation/create': (params) => ({
    badge: 'elicitation',
    badgeClass: 'text-accent',
    summary: asString(params.message) ?? ''
  }),

  'elicitation/response': (params) => {
    const action = asString(params.action) ?? 'unknown'
    return {
      badge: action,
      badgeClass:
        action === 'accept'
          ? 'text-green-500'
          : action === 'decline'
            ? 'text-amber-500'
            : 'text-text-muted',
      summary:
        params.content !== null && typeof params.content === 'object'
          ? JSON.stringify(params.content)
          : ''
    }
  },

  // Synthetic entries recorded around a sampling exchange (same rationale as
  // elicitation — the wire frames are requests, not notifications).
  'sampling/create': (params) => {
    const messages = Array.isArray(params.messages) ? params.messages : []
    return {
      badge: 'sampling',
      badgeClass: 'text-accent',
      summary:
        asString(params.systemPrompt) ??
        (messages.length > 0 ? `${messages.length} message(s)` : '')
    }
  },

  'sampling/response': (params) => {
    const action = asString(params.action) ?? 'unknown'
    const content = params.content
    const text =
      content !== null && typeof content === 'object'
        ? (asString((content as Record<string, unknown>).text) ?? JSON.stringify(content))
        : ''
    return {
      badge: action,
      badgeClass:
        action === 'accept'
          ? 'text-green-500'
          : action === 'decline'
            ? 'text-amber-500'
            : 'text-text-muted',
      summary: action === 'accept' ? text : ''
    }
  }
}

// Unknown methods degrade gracefully: the method name (sans prefix) becomes
// the badge and the raw params the summary — any notification renders.
function fallback(method: string, params: Record<string, unknown>): NotificationPresentation {
  return {
    badge: method.replace(/^notifications\//, ''),
    badgeClass: 'text-text-muted',
    summary: Object.keys(params).length > 0 ? JSON.stringify(params) : ''
  }
}

export function presentNotification(notification: ToolCallNotification): NotificationPresentation {
  const params = notification.params ?? {}
  const presenter = PRESENTERS[notification.method]
  return presenter ? presenter(params) : fallback(notification.method, params)
}
