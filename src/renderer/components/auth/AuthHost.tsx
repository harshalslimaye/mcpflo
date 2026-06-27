import { useEffect, useState } from 'react'
import { useServerStore } from '../../stores/serverStore'
import { DcrRecoveryModal } from './DcrRecoveryModal'

// Mounted once at the app root: subscribes to OAuth flow events pushed from the
// main process and routes them into the store's `auth` field. Follows the
// ElicitationHost / SamplingHost pattern rather than subscribing inside
// serverStore.hydrate, so the listener's lifecycle is tied to a mounted
// component. When a flow fails dynamic client registration (a dcr_required
// event), it surfaces the manual Client ID recovery modal for that server.
export function AuthHost(): React.JSX.Element | null {
  const handleAuthEvent = useServerStore((s) => s.handleAuthEvent)
  const [dcrServerId, setDcrServerId] = useState<string | null>(null)
  const dcrServer = useServerStore((s) =>
    dcrServerId ? (s.servers.find((srv) => srv.id === dcrServerId) ?? null) : null
  )

  useEffect(() => {
    return window.api.mcp.onAuthEvent((event) => {
      handleAuthEvent(event)
      // dcr_required is only emitted when no Client ID was configured, so the
      // recovery modal is always the right response.
      if (event.type === 'dcr_required') {
        setDcrServerId(event.serverId)
      }
    })
  }, [handleAuthEvent])

  if (dcrServer) {
    return <DcrRecoveryModal server={dcrServer} onClose={() => setDcrServerId(null)} />
  }
  return null
}
