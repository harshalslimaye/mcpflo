import { useState } from 'react'
import type { Resource } from '../../../shared/mcp.types'
import { useServerStore, resourceKey } from '../../stores/serverStore'
import { ResourceHeader } from './ResourceHeader'
import { ResourceRequestPanel } from './ResourceRequestPanel'
import { ResourceContentView, type ResourceResultTab } from './ResourceContentView'
import { History } from '../shared/History'
import { HistoryRail } from '../shared/HistoryRail'

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
  const [reading, setReading] = useState(false)
  // Kept here (not in the result view) so it survives across reads — each read
  // swaps in a new record, but the chosen result tab stays put.
  const [resultTab, setResultTab] = useState<ResourceResultTab>('preview')
  // The history record whose content the panel shows. Null means "the latest";
  // clicking a History entry pins that record until the next read.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Explicit selection wins; otherwise the latest read. `find` returning
  // undefined (record capped/cleared away) also falls back to the latest.
  const displayed =
    (selectedId ? history.find((r) => r.id === selectedId) : undefined) ?? history[0]

  async function handleRead(): Promise<void> {
    // Snap the panel back to the read we're about to make.
    setSelectedId(null)
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
          {/* The Request→Result stack scrolls as one page; each panel keeps its
              natural height (Result is capped and scrolls its own body). */}
          <div className="flex-1 min-w-0 flex flex-col gap-[18px] overflow-y-auto min-h-0">
            <ResourceRequestPanel resource={resource} reading={reading} onRead={handleRead} />

            {/* Result of the selected (or latest) read. While a read is in
                flight the same panel renders its reading state. */}
            {(reading || displayed) && (
              <ResourceContentView
                record={reading ? undefined : displayed}
                tab={resultTab}
                onTabChange={setResultTab}
              />
            )}
          </div>

          <HistoryRail
            count={history.length}
            onClear={() => clearResourceHistory(serverId, resource.uri)}
          >
            <History
              records={history}
              emptyLabel="No reads yet."
              selectedId={displayed?.id}
              // A read has no arguments to re-fill — selecting an entry just
              // drives which read's content the panel shows.
              onSelectRecord={(record) => setSelectedId(record.id)}
            />
          </HistoryRail>
        </div>
      </div>
    </div>
  )
}
