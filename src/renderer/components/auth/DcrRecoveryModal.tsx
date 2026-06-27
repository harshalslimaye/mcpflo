import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useServerStore } from '../../stores/serverStore'
import type { MCPServer } from '../../../shared/mcp.types'

interface DcrRecoveryModalProps {
  server: MCPServer
  onClose: () => void
}

// Shown when a server's OAuth flow failed dynamic client registration (DCR) and
// no Client ID was configured. The user pastes the credentials the server
// operator gave them; saving them onto the server's oauth config and re-running
// the flow is the recovery path (there's no edit-server UI in v1).
export function DcrRecoveryModal({ server, onClose }: DcrRecoveryModalProps): React.JSX.Element {
  const updateServer = useServerStore((s) => s.updateServer)
  const authorizeServer = useServerStore((s) => s.authorizeServer)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  async function handleContinue(): Promise<void> {
    const id = clientId.trim()
    if (!id) {
      setError('Client ID is required')
      return
    }
    const t = server.transport
    // DCR recovery only applies to OAuth streamable-http servers; nothing else
    // can reach this modal.
    if (t.type !== 'streamable-http') return

    const secret = clientSecret.trim()
    setSubmitting(true)
    try {
      await updateServer(server.id, {
        transport: {
          ...t,
          auth: 'oauth',
          oauth: { ...t.oauth, clientId: id, ...(secret && { clientSecret: secret }) }
        }
      })
    } catch {
      // updateServer surfaced a toast; keep the modal open to retry.
      setSubmitting(false)
      return
    }
    onClose()
    // Re-run the flow with the freshly-saved credentials (drives its own auth
    // events / errors from here).
    void authorizeServer(server.id)
  }

  return (
    <Modal title="Sign in requires a Client ID" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-muted leading-relaxed">
          This server doesn&apos;t support automatic registration. Paste the Client ID (and
          optionally a Client Secret) provided by the server operator.
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted">
            Client ID<span className="text-accent ml-0.5">*</span>
          </label>
          <input
            aria-label="Client ID"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value)
              setError(undefined)
            }}
            placeholder="client-id-from-operator"
            spellCheck={false}
            autoComplete="off"
            className="w-full px-3 py-1.5 rounded border border-border bg-bg-elevated text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted">
            Client Secret<span className="ml-1 text-text-muted opacity-60">Optional</span>
          </label>
          <div className="relative">
            <input
              type={revealed ? 'text' : 'password'}
              aria-label="Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              className="w-full px-3 py-1.5 pr-9 rounded border border-border bg-bg-elevated text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? 'Hide value' : 'Show value'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-fg-faint hover:text-text-primary transition-colors cursor-pointer"
            >
              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={submitting}
            className="px-3 py-1.5 rounded text-sm bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-default"
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
