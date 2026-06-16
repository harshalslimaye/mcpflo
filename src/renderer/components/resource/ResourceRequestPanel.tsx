import type { Resource } from '../../../shared/mcp.types'
import { RequestPanel } from '../shared/RequestPanel'

interface ResourceRequestPanelProps {
  resource: Resource
  reading: boolean
  onRead: () => void
}

// A resource has no parameters to fill — the request is just the (read-only) uri
// and the Read action — so it uses the shared shell with no header controls.
export function ResourceRequestPanel({
  resource,
  reading,
  onRead
}: ResourceRequestPanelProps): React.JSX.Element {
  return (
    <RequestPanel
      statusHint={reading ? 'Reading…' : 'Ready'}
      run={{
        label: 'Read',
        busyLabel: 'Reading…',
        busy: reading,
        disabled: reading,
        onRun: onRead
      }}
    >
      {/* The uri is fixed for a static resource, so it's shown read-only for
          context rather than as an editable input. */}
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
    </RequestPanel>
  )
}
