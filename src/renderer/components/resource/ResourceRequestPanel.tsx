import { useMemo } from 'react'
import type { Resource } from '../../../shared/mcp.types'
import { RequestPanel } from '../shared/RequestPanel'
import { TestScriptEditor } from '../shared/TestScriptEditor'
import { useTestScript } from '../shared/useTestScript'
import { estimateResourceTokens } from '../../lib/contextBudget'

export type RequestTab = 'details' | 'tests'

const TABS: { key: RequestTab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'tests', label: 'Tests' }
]

interface ResourceRequestPanelProps {
  resource: Resource
  serverId: string
  // The tab toggle is owned by the parent, same as Tool/Prompt — unlike those,
  // a resource has no Params/Schema tabs, so this is the first tab bar on its
  // Request panel; it exists solely to carry the new Tests tab.
  activeTab: RequestTab
  onTabChange: (tab: RequestTab) => void
  reading: boolean
  onRead: () => void
}

// A resource has no parameters to fill — the request is just the (read-only) uri
// and the Read action — so the Details tab shows that read-only context inline,
// same as before this component had any tabs at all. Its "arguments" are just
// its own fixed uri, so — unlike tools/prompts — there's no Saved Requests
// concept here either.
export function ResourceRequestPanel({
  resource,
  serverId,
  activeTab,
  onTabChange,
  reading,
  onRead
}: ResourceRequestPanelProps): React.JSX.Element {
  const definitionTokens = useMemo(() => estimateResourceTokens(resource), [resource])

  // Load/autosave/flush-on-unmount for the Tests tab — see useTestScript.
  const {
    script,
    hasScript,
    onChange: handleScriptChange
  } = useTestScript(serverId, 'resource', resource.uri)

  const headerEnd = (
    <div className="flex gap-0.5">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={`inline-flex items-center gap-1.5 rounded-[6px] px-[11px] py-[5px] text-[12.5px] transition-colors ${
            activeTab === tab.key
              ? 'bg-accent-soft text-accent'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {tab.label}
          {tab.key === 'tests' && hasScript && (
            <span
              aria-label="Has a saved test script"
              className="h-1.5 w-1.5 rounded-full bg-accent"
            />
          )}
        </button>
      ))}
    </div>
  )

  return (
    <RequestPanel
      headerEnd={headerEnd}
      statusHint={reading ? 'Reading…' : 'Ready'}
      run={{
        label: 'Read',
        busyLabel: 'Reading…',
        busy: reading,
        disabled: reading,
        onRun: onRead
      }}
    >
      {activeTab === 'tests' ? (
        <TestScriptEditor
          value={script}
          onChange={handleScriptChange}
          placeholder={
            'test("has content", function () {\n  expect(res.getText()).to.be.a("string")\n})'
          }
        />
      ) : (
        // The uri is fixed for a static resource, so it's shown read-only for
        // context rather than as an editable input.
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
      )}
    </RequestPanel>
  )
}
