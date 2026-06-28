import { useMemo } from 'react'
import type { Resource } from '../../../shared/mcp.types'
import { RequestPanel } from '../shared/RequestPanel'
import { estimateResourceTokens } from '../../lib/contextBudget'

interface ResourceRequestPanelProps {
  resource: Resource
  reading: boolean
  onRead: () => void
}

// A resource has no parameters to fill — the request is just the (read-only) uri
// and the Read action — so it uses the shared shell with no header controls.
// Unlike tools/prompts, there's no Params/Schema tab bar to extend with a
// Tokens tab, so the resource's own definition cost is shown inline instead.
export function ResourceRequestPanel({
  resource,
  reading,
  onRead
}: ResourceRequestPanelProps): React.JSX.Element {
  const definitionTokens = useMemo(() => estimateResourceTokens(resource), [resource])

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
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="resource-uri" className="font-mono text-[13px] text-text-primary">
            URI
          </label>
          <span className="text-[11px] text-fg-faint">
            ~{definitionTokens.toLocaleString()} tokens to define
          </span>
        </div>
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
