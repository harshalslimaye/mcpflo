import { useState } from 'react'
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
    // Height-constrained so the History rail can fill the full content height.
    <div className="flex-1 h-full bg-bg-primary flex flex-col overflow-hidden">
      <div className="flex flex-col gap-5 flex-1 min-h-0 px-6 pt-6 pb-5">
        <ResourceHeader resource={resource} serverName={serverName} />

        {/* Two columns: action + result on the left (scrolls independently),
            History on the right rail stretched to full height. */}
        <div className="flex gap-6 items-stretch flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col gap-5 overflow-y-auto">
            <div className="flex flex-col gap-4 max-w-2xl">
              {/* The uri is fixed for a static resource, so it's shown read-only
                  for context rather than as an editable input. */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="resource-uri" className="text-xs text-text-muted">
                  URI
                </label>
                <input
                  id="resource-uri"
                  type="text"
                  value={resource.uri}
                  readOnly
                  disabled
                  aria-label="Resource URI"
                  className="w-full px-3 py-2 rounded border border-border bg-bg-elevated text-text-muted text-sm font-mono cursor-not-allowed"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleRead}
                  disabled={reading}
                  className="px-4 py-1.5 rounded text-sm bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reading ? 'Reading…' : 'Read'}
                </button>
              </div>

              {/* Result of the most recent read for this resource. While a read
                  is in flight the same view renders in its reading state. */}
              {(reading || latestRead) && (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <span className="text-xs text-text-muted uppercase tracking-wider font-medium">
                    Result
                  </span>
                  <ResourceContentView
                    record={reading ? undefined : latestRead}
                    tab={resultTab}
                    onTabChange={setResultTab}
                  />
                </div>
              )}
            </div>
          </div>

          <aside className="w-80 shrink-0 flex flex-col gap-2 min-h-0">
            <h2 className="text-text-muted text-xs uppercase tracking-wider font-medium shrink-0">
              History
            </h2>
            <div className="border border-border rounded bg-bg-elevated flex-1 min-h-0 overflow-y-auto">
              <ResourceHistory records={history} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
