import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { MCPServer, AuthDetails } from '../../../shared/mcp.types'
import { formatExpiry } from '../../lib/formatExpiry'

interface AuthDetailsCardProps {
  server: MCPServer
}

function Field({
  label,
  full = false,
  children
}: {
  label: string
  full?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${full ? '[grid-column:1/-1]' : ''}`}>
      <span className="font-mono text-[9.5px] tracking-[0.08em] uppercase text-fg-faint">
        {label}
      </span>
      <span className="min-w-0 text-[12.5px] leading-[1.4] text-text-primary">{children}</span>
    </div>
  )
}

// Redacted OAuth session summary for a signed-in server: client identity, how
// it was registered, granted scopes, and token expiry. Everything shown is
// derived metadata fetched over mcp:getAuthDetails — the tokens themselves
// never reach the renderer. Hidden entirely for non-OAuth servers and until
// the server is actually signed in (an empty card would just be noise).
//
// The header renders the instant `authenticated` is true (that comes from
// server.auth.status, no IPC round trip needed); only the field grid below it
// waits on the async fetch. This keeps the card's DOM footprint — and thus
// the two-column grid it shares with ContextBudgetCard in ServerDetailView —
// stable from the first paint, instead of popping in and shifting layout.
export function AuthDetailsCard({ server }: AuthDetailsCardProps): React.JSX.Element | null {
  const authenticated = server.auth?.status === 'authenticated'
  // undefined = not yet fetched, null = fetched but main reported no session.
  const [details, setDetails] = useState<AuthDetails | null | undefined>(undefined)

  // No reset on sign-out: the render guard below already hides the card
  // whenever `authenticated` is false, so stale `details` from a prior
  // session never actually renders.
  useEffect(() => {
    if (!authenticated) return
    let active = true
    window.api.mcp
      .getAuthDetails(server.id)
      .then((d) => {
        if (active) setDetails(d)
      })
      .catch(() => {
        if (active) setDetails(null)
      })
    return () => {
      active = false
    }
  }, [server.id, authenticated])

  // Tick every 30s so the expiry countdown stays roughly current while the
  // panel sits open — same cadence as ServerHeader's "fetched … ago" label.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!authenticated) return null

  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface">
      <div className="flex items-center gap-3 border-b border-border bg-panel-2 px-4 py-[11px]">
        <ShieldCheck size={14} className="shrink-0 text-fg-faint" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
          Authentication
        </span>
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-green">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-green" />
          Signed in
        </span>
      </div>

      {details === undefined ? (
        <div className="p-4 text-[12.5px] text-text-muted">Loading session details…</div>
      ) : details === null ? (
        <div className="p-4 text-[12.5px] text-text-muted">No session details available.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-3 px-4 py-[14px]">
          <Field label="Client ID">
            {details.clientId ? (
              <span className="block truncate font-mono text-[12px]" title={details.clientId}>
                {details.clientId}
              </span>
            ) : (
              <span className="text-text-muted">Unknown</span>
            )}
          </Field>
          <Field label="Registration">
            {details.registration === 'dcr' ? 'Auto-registered (DCR)' : 'Manual Client ID'}
          </Field>
          <Field label="Client type">
            {details.clientType === 'confidential' ? 'Confidential' : 'Public'}
          </Field>
          <Field label="Token type">{details.tokenType ?? 'Unknown'}</Field>
          <Field label="Expires">
            <span
              className={
                details.expiresAt !== null && details.expiresAt <= now ? 'text-red-400' : undefined
              }
            >
              {formatExpiry(details.expiresAt, now)}
            </span>
          </Field>
          <Field label="Refresh token">
            {details.hasRefreshToken ? 'Available' : <span className="text-text-muted">None</span>}
          </Field>
          <Field label="ID token">
            {details.hasIdToken ? 'Available' : <span className="text-text-muted">None</span>}
          </Field>
          <Field label="Redirect URI">
            {details.redirectUri ? (
              <span className="block truncate font-mono text-[12px]" title={details.redirectUri}>
                {details.redirectUri}
              </span>
            ) : (
              <span className="text-text-muted">Unknown</span>
            )}
          </Field>
          <Field label="Scopes" full>
            {details.scope ? (
              <span className="flex flex-wrap gap-1.5">
                {details.scope.split(/\s+/).map((s) => (
                  <span
                    key={s}
                    className="max-w-full break-all rounded-full border border-border-soft bg-bg-elevated px-[9px] py-px font-mono text-[11px] text-text-muted"
                  >
                    {s}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-text-muted">Not reported</span>
            )}
          </Field>
        </div>
      )}
    </div>
  )
}
