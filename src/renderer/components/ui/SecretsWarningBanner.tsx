import { useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'

// Shown when the OS keyring was unavailable, so MCPFlo had to persist server
// secrets (tokens, API keys) as plaintext in its config file. It's dismissible
// for the session — the flag itself is re-read on the next launch, so the
// warning returns if the situation persists.
export function SecretsWarningBanner(): React.JSX.Element | null {
  const plaintext = useServerStore((s) => s.secretsPlaintext)
  const [dismissed, setDismissed] = useState(false)

  if (!plaintext || dismissed) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-2 px-3 py-2 border-b border-amber-500/40 bg-amber-500/10 text-amber-200"
    >
      <ShieldAlert size={16} className="shrink-0 mt-0.5" />
      <p className="flex-1 text-xs leading-snug">
        No OS keyring is available, so server secrets (tokens, API keys) are stored{' '}
        <span className="font-semibold">unencrypted</span> on disk. Anyone with access to your
        config file can read them.
      </p>
      <button
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 p-0.5 rounded text-amber-200/70 hover:text-amber-100 hover:bg-amber-500/20 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
