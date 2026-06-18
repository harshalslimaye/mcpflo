import { useRef, useState } from 'react'
import type { Resource } from '../../../shared/mcp.types'
import { useServerStore, resourceKey } from '../../stores/serverStore'
import { ResourceHeader } from './ResourceHeader'
import { ResourceRequestPanel } from './ResourceRequestPanel'
import { ResourceContentView, type ResourceResultTab } from './ResourceContentView'
import { History } from '../shared/History'
import { HistoryRail } from '../shared/HistoryRail'
import { ResultDock } from '../shared/ResultDock'
import { useResultDock } from '../shared/useResultDock'

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
  // The result dock's open/collapsed/full + height state.
  const dock = useResultDock()
  // Drag reference frame: the full-height center column.
  const centerRef = useRef<HTMLDivElement>(null)

  async function handleRead(): Promise<void> {
    // Snap the panel back to the read we're about to make, and reveal the dock
    // if it was collapsed.
    setSelectedId(null)
    dock.reveal()
    setReading(true)
    try {
      await readResource(serverId, resource.uri)
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="flex-1 h-full bg-bg-primary flex overflow-hidden">
      {/* Center column: the form scroller (header + Request, padded) with the
          Result dock as a full-bleed band anchored to its bottom. */}
      <div ref={centerRef} className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[18px] px-7 pt-[22px] pb-6">
          <ResourceHeader resource={resource} serverName={serverName} />
          <ResourceRequestPanel resource={resource} reading={reading} onRead={handleRead} />
        </div>

        {/* Result dock: always present (minimized by default), revealed on
            read. While a read is in flight it renders the reading state; before
            any run it sits idle. */}
        <ResultDock containerRef={centerRef} dock={dock}>
          <ResourceContentView
            record={reading ? undefined : displayed}
            busy={reading}
            tab={resultTab}
            onTabChange={setResultTab}
            docked
            collapsed={dock.collapsed}
            full={dock.full}
            onToggleCollapse={dock.toggleCollapse}
            onToggleMax={dock.toggleMax}
          />
        </ResultDock>
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
          // drives which read's content the panel shows (and reveals the dock).
          onSelectRecord={(record) => {
            setSelectedId(record.id)
            dock.reveal()
          }}
        />
      </HistoryRail>
    </div>
  )
}
