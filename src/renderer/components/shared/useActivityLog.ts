import { useCallback, useMemo } from 'react'
import { useServerStore } from '../../stores/serverStore'
import { mergeActivity, type ActivityEvent } from '../../lib/activityEvent'

interface ActivityLog {
  // The unified, newest-first "All" list across every server.
  events: ActivityEvent[]
  // Navigates to a call row's tool/resource/prompt; a no-op for protocol rows.
  navigateTo: (event: ActivityEvent) => void
  // Clears every history slice at once.
  clearAll: () => void
}

// Shared backing for the "All" activity view: merges the per-key call histories
// with the protocol-event slice and exposes navigation + clear. Used by both the
// tabbed entity rail and the global (empty-state) rail so the two stay in sync.
export function useActivityLog(): ActivityLog {
  const history = useServerStore((s) => s.history)
  const resourceHistory = useServerStore((s) => s.resourceHistory)
  const promptHistory = useServerStore((s) => s.promptHistory)
  const protocolEvents = useServerStore((s) => s.protocolEvents)
  const clearAll = useServerStore((s) => s.clearAllActivity)
  const selectTool = useServerStore((s) => s.selectTool)
  const selectResource = useServerStore((s) => s.selectResource)
  const selectPrompt = useServerStore((s) => s.selectPrompt)

  const events = useMemo(
    () => mergeActivity(history, resourceHistory, promptHistory, protocolEvents),
    [history, resourceHistory, promptHistory, protocolEvents]
  )

  const navigateTo = useCallback(
    (event: ActivityEvent) => {
      const target = event.target
      if (!target) return
      if (target.kind === 'tool') selectTool(target.serverId, target.toolName)
      else if (target.kind === 'resource') selectResource(target.serverId, target.uri)
      else selectPrompt(target.serverId, target.promptName)
    },
    [selectTool, selectResource, selectPrompt]
  )

  return { events, navigateTo, clearAll }
}
