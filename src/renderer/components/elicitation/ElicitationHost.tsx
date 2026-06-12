import { useEffect } from 'react'
import { useServerStore } from '../../stores/serverStore'
import { ElicitationModal } from './ElicitationModal'

// Mounted once at the app root: receives elicitation requests pushed from the
// main process and shows them one at a time, oldest first. The `key` remounts
// the modal (resetting its form) when the head of the queue changes.
export function ElicitationHost(): React.JSX.Element | null {
  const pending = useServerStore((s) => s.pendingElicitations)
  const enqueueElicitation = useServerStore((s) => s.enqueueElicitation)
  const removeElicitation = useServerStore((s) => s.removeElicitation)

  useEffect(() => {
    const unsubscribeRequest = window.api.mcp.onElicitationRequest(enqueueElicitation)
    const unsubscribeClosed = window.api.mcp.onElicitationClosed((event) =>
      removeElicitation(event.elicitationId)
    )
    return () => {
      unsubscribeRequest()
      unsubscribeClosed()
    }
  }, [enqueueElicitation, removeElicitation])

  const current = pending[0]
  if (!current) return null
  return <ElicitationModal key={current.elicitationId} request={current} />
}
