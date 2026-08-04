import { useEffect, useRef, useState } from 'react'
import type { ResourceTemplate } from '../../../shared/mcp.types'
import { useServerStore, resourceKey } from '../../stores/serverStore'
import { isResourceTemplateEmpty } from '../../lib/resourceTemplateSchema'
import { ResourceTemplateHeader } from './ResourceTemplateHeader'
import {
  ResourceTemplateRequestPanel,
  type TemplateRequestTab
} from './ResourceTemplateRequestPanel'
import { ResourceContentView, type ResourceResultTab } from './ResourceContentView'
import { ActivityRail } from '../shared/ActivityRail'
import { ResultDock } from '../shared/ResultDock'
import { useResultDock } from '../shared/useResultDock'

interface ResourceTemplateDetailViewProps {
  template: ResourceTemplate
  serverId: string
  serverName: string
}

export function ResourceTemplateDetailView({
  template,
  serverId,
  serverName
}: ResourceTemplateDetailViewProps): React.JSX.Element {
  const readResourceTemplate = useServerStore((s) => s.readResourceTemplate)
  const clearResourceHistory = useServerStore((s) => s.clearResourceHistory)
  // Keyed by the template, so reads with different values share one history —
  // see readResourceTemplate.
  const key = resourceKey(serverId, template.uriTemplate)
  const history = useServerStore((s) => s.resourceHistory[key]) ?? []
  // Gates the completion typeahead in the Params tab.
  const completionsSupported = useServerStore(
    (s) => s.servers.find((srv) => srv.id === serverId)?.features?.completions ?? false
  )

  const [activeTab, setActiveTab] = useState<TemplateRequestTab>('params')
  const [running, setRunning] = useState(false)
  // Kept here (not in the result view) so it survives across reads.
  const [resultTab, setResultTab] = useState<ResourceResultTab>('preview')
  // The history record whose content the panel shows. Null means "the latest";
  // clicking a History entry pins that record until the next read.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // A request to re-fill the form with a past read's values. `nonce` is bumped
  // each click so re-selecting the same record re-applies it.
  const [prefill, setPrefill] = useState<{ args: Record<string, string>; nonce: number } | null>(
    null
  )
  const dock = useResultDock()
  // Drag reference frame: the full-height center column.
  const centerRef = useRef<HTMLDivElement>(null)

  // Explicit selection wins; otherwise the latest read. `find` returning
  // undefined (record capped/cleared away) also falls back to the latest.
  const displayed =
    (selectedId ? history.find((r) => r.id === selectedId) : undefined) ?? history[0]
  // A template with no variables has no form to re-fill.
  const isEmpty = isResourceTemplateEmpty(template)

  // A cross-tab prefill handed off when this template was opened from the "All"
  // history tab (see useActivityLog). Feeds the form directly and is cleared
  // right after so a later remount can't replay it. Keyed by uriTemplate, which
  // is what identifies a template the way a name identifies a tool or prompt.
  const pendingPrefill = useServerStore((s) => s.pendingPrefill)
  const clearPendingPrefill = useServerStore((s) => s.clearPendingPrefill)
  const prefillMatches =
    pendingPrefill?.serverId === serverId && pendingPrefill?.name === template.uriTemplate
  const effectivePrefill =
    prefillMatches && !isEmpty
      ? { args: pendingPrefill.args as Record<string, string>, nonce: pendingPrefill.nonce }
      : prefill
  useEffect(() => {
    if (prefillMatches) clearPendingPrefill()
  }, [prefillMatches, clearPendingPrefill])

  async function handleExecute(values: Record<string, string>): Promise<void> {
    // Snap the panel back to the read we're about to make, and reveal the dock
    // if it was collapsed.
    setSelectedId(null)
    dock.reveal()
    setRunning(true)
    try {
      await readResourceTemplate(serverId, template.uriTemplate, values)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex-1 h-full bg-bg-primary flex overflow-hidden">
      {/* Center column: the form scroller (header + Request, padded) with the
          Result dock as a full-bleed band anchored to its bottom. */}
      <div ref={centerRef} className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[18px] px-7 pt-[22px] pb-6">
          <ResourceTemplateHeader template={template} serverName={serverName} />
          <ResourceTemplateRequestPanel
            template={template}
            serverId={serverId}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            prefill={effectivePrefill}
            running={running}
            onExecute={handleExecute}
            completionsSupported={completionsSupported}
          />
        </div>

        <ResultDock containerRef={centerRef} dock={dock}>
          <ResourceContentView
            record={running ? undefined : displayed}
            busy={running}
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

      <ActivityRail
        thisRecords={history}
        thisTabLabel="This template"
        emptyLabel="No reads yet."
        selectedId={displayed?.id}
        onClearThis={() => clearResourceHistory(serverId, template.uriTemplate)}
        // Every row shares the template as its label, so the URI it actually
        // read is the only thing that tells one read from another — except for
        // a read whose expansion failed, which never reached a URI. That falls
        // back to the error, so the row says why instead of sitting blank.
        renderDetail={(record) => {
          const detail = record.expandedUri ?? record.error
          return (
            <span
              className="block truncate font-mono text-[11px] text-code opacity-85"
              title={detail}
            >
              {detail}
            </span>
          )
        }}
        // Unlike a plain resource read, selecting an entry also re-fills the
        // form: a template read has inputs, so the useful thing to do with a
        // past one is to edit and re-run it, not just look at what came back.
        onSelectThis={(record) => {
          setSelectedId(record.id)
          dock.reveal()
          if (!isEmpty && record.args) {
            const args = record.args
            setPrefill((prev) => ({ args, nonce: (prev?.nonce ?? 0) + 1 }))
          }
        }}
      />
    </div>
  )
}
