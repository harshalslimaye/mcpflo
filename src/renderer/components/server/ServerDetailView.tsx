import { useState } from 'react'
import type { MCPServer } from '../../../shared/mcp.types'
import { useServerStore } from '../../stores/serverStore'
import { ServerHeader } from './ServerHeader'
import { ServerActionBar } from './ServerActionBar'
import { AuthDetailsCard } from './AuthDetailsCard'
import { ContextBudgetCard } from './ContextBudgetCard'
import { CapabilitySections } from './CapabilitySections'
import { DeleteServerModal } from '../servers/DeleteServerModal'
import { GlobalActivityRail } from '../shared/GlobalActivityRail'

interface ServerDetailViewProps {
  server: MCPServer
}

// The content-area view for a selected server: header, action bar,
// context-budget card, and the Tools/Resources/Prompts sections, with the
// activity log on the right rail.
export function ServerDetailView({ server }: ServerDetailViewProps): React.JSX.Element {
  const refreshCapabilities = useServerStore((s) => s.refreshCapabilities)
  const cancelFetch = useServerStore((s) => s.cancelFetch)
  const disconnectServer = useServerStore((s) => s.disconnectServer)
  const clearAuth = useServerStore((s) => s.clearAuth)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // AuthDetailsCard renders as soon as the server is authenticated (its own
  // async fetch fills in underneath — see its comment), so gating the
  // side-by-side layout on the same flag keeps this decision in sync with
  // whether the card actually occupies a grid cell.
  const showAuthDetails = server.auth?.status === 'authenticated'

  return (
    <div className="flex-1 h-full bg-bg-primary flex overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[18px] px-7 pt-[22px] pb-6 @container">
          <ServerHeader server={server} />
          <ServerActionBar
            server={server}
            onDisconnect={() => disconnectServer(server.id)}
            onReload={() => refreshCapabilities(server.id)}
            onCancel={() => cancelFetch(server.id)}
            onSignOut={() => clearAuth(server.id)}
            onDelete={() => setConfirmingDelete(true)}
          />
          {showAuthDetails ? (
            <div className="grid grid-cols-1 items-stretch gap-[14px] @min-[760px]:grid-cols-[minmax(260px,380px)_1fr]">
              <AuthDetailsCard server={server} />
              <ContextBudgetCard server={server} />
            </div>
          ) : (
            <ContextBudgetCard server={server} />
          )}
          <CapabilitySections server={server} />
        </div>
      </div>

      <GlobalActivityRail />

      {confirmingDelete && (
        <DeleteServerModal
          serverId={server.id}
          serverName={server.name}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
