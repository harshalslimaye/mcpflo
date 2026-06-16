import { useState } from 'react'
import { Play } from 'lucide-react'
import type { Resource } from '../../../shared/mcp.types'
import { useServerStore, resourceKey } from '../../stores/serverStore'
import { ResourceHeader } from './ResourceHeader'
import { ResourceContentView, type ResourceResultTab } from './ResourceContentView'
import { ResourceHistory } from './ResourceHistory'

interface ResourceDetailViewProps {
  resource: Resource
  serverId: string
  serverName: string
}

export function ResourceDetailView({
  resource,
  serverId,
  serverName
}: ResourceDetailViewProps): React.JSX.Element {
  const readResource = useServerStore((s) => s.readResource)
  const clearResourceHistory = useServerStore((s) => s.clearResourceHistory)
  const history =
    useServerStore((s) => s.resourceHistory[resourceKey(serverId, resource.uri)]) ?? []
  const latestRead = history[0]
  const [reading, setReading] = useState(false)
  // Kept here (not in the result view) so it survives across reads — each read
  // swaps in a new record, but the chosen result tab stays put.
  const [resultTab, setResultTab] = useState<ResourceResultTab>('preview')

  async function handleRead(): Promise<void> {
    setReading(true)
    try {
      await readResource(serverId, resource.uri)
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="flex-1 h-full bg-bg-primary flex flex-col overflow-hidden">
      <div className="flex flex-col gap-[18px] flex-1 min-h-0 px-7 pt-[22px] pb-6">
        <ResourceHeader resource={resource} serverName={serverName} />

        {/* Request + Result stacked on the left; History rail on the right. */}
        <div className="flex gap-6 items-stretch flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col gap-[18px]">
            {/* Request panel: the (read-only) uri and the Read action. */}
            <section className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface">
              <div className="flex items-center gap-4 border-b border-border bg-panel-2 px-4 py-[11px]">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
                  Request
                </span>
              </div>

              <div className="px-4 py-[18px]">
                {/* The uri is fixed for a static resource, so it's shown read-only
                    for context rather than as an editable input. */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="resource-uri" className="font-mono text-[13px] text-text-primary">
                    URI
                  </label>
                  <input
                    id="resource-uri"
                    type="text"
                    value={resource.uri}
                    readOnly
                    disabled
                    aria-label="Resource URI"
                    className="w-full cursor-not-allowed rounded-[8px] border border-border bg-bg-elevated px-[13px] py-[11px] font-mono text-[13.5px] text-text-muted outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 border-t border-border-soft bg-bg-elevated px-4 py-[13px]">
                <span className="font-mono text-[11.5px] text-fg-faint">
                  {reading ? 'Reading…' : 'Ready'}
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleRead}
                  disabled={reading}
                  className="inline-flex items-center gap-2 rounded-[8px] bg-[image:var(--btn)] px-[22px] py-[9px] text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play size={13} fill="currentColor" />
                  {reading ? 'Reading…' : 'Read'}
                </button>
              </div>
            </section>

            {/* Result of the most recent read. While a read is in flight the same
                panel renders its reading state. */}
            {(reading || latestRead) && (
              <ResourceContentView
                record={reading ? undefined : latestRead}
                tab={resultTab}
                onTabChange={setResultTab}
              />
            )}
          </div>

          <aside className="w-[304px] shrink-0 flex flex-col min-h-0 border-l border-border pl-6">
            <div className="flex items-center gap-2.5 px-1 pb-2.5 shrink-0">
              <h2 className="flex-1 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-faint">
                History
              </h2>
              {history.length > 0 && (
                <>
                  <span className="rounded-full border border-border-soft bg-bg-elevated px-[7px] py-px font-mono text-[10px] text-fg-faint">
                    {history.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => clearResourceHistory(serverId, resource.uri)}
                    className="font-mono text-[11px] text-fg-faint transition-colors hover:text-accent"
                  >
                    clear
                  </button>
                </>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ResourceHistory records={history} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
