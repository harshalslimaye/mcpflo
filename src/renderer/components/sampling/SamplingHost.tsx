import { useEffect } from 'react'
import { useServerStore } from '../../stores/serverStore'
import { SamplingModal } from './SamplingModal'

// Mounted once at the app root: receives sampling requests pushed from the main
// process and shows them one at a time, oldest first. The `key` remounts the
// modal (resetting its draft) when the head of the queue changes.
export function SamplingHost(): React.JSX.Element | null {
  const pending = useServerStore((s) => s.pendingSamplings)
  const enqueueSampling = useServerStore((s) => s.enqueueSampling)
  const removeSampling = useServerStore((s) => s.removeSampling)

  useEffect(() => {
    const unsubscribeRequest = window.api.mcp.onSamplingRequest(enqueueSampling)
    const unsubscribeClosed = window.api.mcp.onSamplingClosed((event) =>
      removeSampling(event.samplingId)
    )
    return () => {
      unsubscribeRequest()
      unsubscribeClosed()
    }
  }, [enqueueSampling, removeSampling])

  const current = pending[0]
  if (!current) return null
  return <SamplingModal key={current.samplingId} request={current} />
}
