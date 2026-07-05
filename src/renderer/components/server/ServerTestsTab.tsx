import { useState } from 'react'
import {
  Wrench,
  Database,
  MessageSquare,
  Zap,
  FileText,
  Hash,
  Play,
  RotateCw,
  ChevronRight
} from 'lucide-react'
import type { MCPServer, Resource } from '../../../shared/mcp.types'
import type { TestKind } from '../../../shared/testing.types'
import { useServerStore, testsTabKey, type TestsTabRunState } from '../../stores/serverStore'
import { TestRow } from '../shared/TestResultsView'

interface ServerTestsTabProps {
  server: MCPServer
  // Which capabilities have a saved script, as `${kind}::${name}` keys —
  // fetched once by the owning ServerDetailView (it also needs the count for
  // the Tests tab badge, so there's a single listScripts call, not one per
  // tab visit plus one for the badge).
  scripted: Set<string> | undefined
  onScriptedChange: (scripted: Set<string>) => void
}

type Category = 'tools' | 'resources' | 'prompts'

const CATEGORY_META: Record<Category, { kind: TestKind; label: string; icon: React.ReactNode }> = {
  tools: { kind: 'tool', label: 'Tools', icon: <Wrench size={13} /> },
  resources: { kind: 'resource', label: 'Resources', icon: <Database size={13} /> },
  prompts: { kind: 'prompt', label: 'Prompts', icon: <MessageSquare size={13} /> }
}

// Mirrors CapabilitySections' fallback: a resource without a friendly name
// displays as its uri.
function resourceLabel(resource: Resource): string {
  return resource.name ?? resource.uri
}

interface Row {
  key: string
  icon: React.ReactNode
  label: string
}

// One capability row: a status (no script / not run / running / skipped /
// pass-fail) plus a per-row Run button, expanding on click to the same
// per-test rows (TestRow, borrowed from TestResultsView) the individual
// tool/resource/prompt Tests tab uses for a completed run.
function CapabilityTestRow({
  row,
  hasScript,
  run,
  onRun
}: {
  row: Row
  hasScript: boolean
  run: TestsTabRunState | undefined
  onRun: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const canExpand = run?.state === 'done'
  const running = run?.state === 'running'

  return (
    <div className="flex flex-col border-b border-border-soft last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-[10px]">
        <button
          type="button"
          onClick={() => canExpand && setOpen((v) => !v)}
          disabled={!canExpand}
          className={`flex min-w-0 flex-1 items-center gap-3 text-left ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {canExpand ? (
            <ChevronRight
              size={13}
              className={`shrink-0 text-fg-faint transition-transform ${open ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="w-[13px] shrink-0" />
          )}
          <span className="shrink-0 text-fg-faint">{row.icon}</span>
          <span className="shrink-0 font-mono text-[12.5px] text-text-primary">{row.label}</span>
          <div className="flex-1" />
          {!hasScript ? (
            <span className="text-[11.5px] text-fg-faint">No test script</span>
          ) : running ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-muted">
              <RotateCw size={11} className="animate-spin" />
              Running…
            </span>
          ) : run?.state === 'skipped' ? (
            <span className="text-[11.5px] text-orange-500">Skipped — needs input</span>
          ) : run?.state === 'done' ? (
            <span className="inline-flex items-center gap-2 text-[11.5px]">
              <span className="text-green">{run.summary.passed} passed</span>
              {run.summary.failed > 0 && (
                <span className="text-red-500">{run.summary.failed} failed</span>
              )}
            </span>
          ) : (
            <span className="text-[11.5px] text-fg-faint">Not tested</span>
          )}
        </button>
        {hasScript && (
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            aria-label={`Run ${row.label}`}
            className="inline-flex shrink-0 items-center justify-center rounded-[6px] p-1 text-fg-faint transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={13} />
          </button>
        )}
      </div>
      {canExpand && open && run.state === 'done' && (
        <div className="flex flex-col gap-1.5 border-t border-border-soft bg-bg-elevated/40 px-4 py-2.5">
          {run.summary.scriptError && (
            <div className="rounded border border-orange-500/40 bg-orange-500/5 px-3 py-2">
              <p className="font-mono text-[11px] font-semibold tracking-wide text-orange-500 uppercase">
                Script error — {run.summary.scriptError.type}
              </p>
              <p className="mt-1 font-mono text-xs whitespace-pre-wrap break-words text-text-primary">
                {run.summary.scriptError.message}
              </p>
            </div>
          )}
          {run.summary.results.map((result, i) => (
            <TestRow key={i} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}

// The server-level Tests tab: every tool/resource/prompt with a saved script,
// grouped the same way CapabilitySections groups the Capabilities tab, with a
// bulk "Run all tests" action and a per-row Run button (the mockup's stated
// gap — bulk-only, no per-capability run). Reuses TestResultsView's TestRow
// for the expanded pass/fail detail rather than re-building it.
export function ServerTestsTab({
  server,
  scripted,
  onScriptedChange
}: ServerTestsTabProps): React.JSX.Element | null {
  const testsTabRuns = useServerStore((s) => s.testsTabRuns)
  const runCapabilityTests = useServerStore((s) => s.runCapabilityTests)
  const runAllTests = useServerStore((s) => s.runAllTests)
  const [runningAll, setRunningAll] = useState(false)

  const rowsByCategory: Record<Category, Row[]> = {
    tools: server.tools.map((t) => ({ key: t.name, icon: <Zap size={13} />, label: t.name })),
    resources: server.resources.map((r) => ({
      key: r.uri,
      icon: <FileText size={13} />,
      label: resourceLabel(r)
    })),
    prompts: server.prompts.map((p) => ({ key: p.name, icon: <Hash size={13} />, label: p.name }))
  }

  const totalCapabilities = server.tools.length + server.resources.length + server.prompts.length
  if (totalCapabilities === 0) return null

  async function handleRunAll(): Promise<void> {
    setRunningAll(true)
    try {
      await runAllTests(server.id)
      // Scripts don't change from running tests, but a script could have been
      // added/removed from another tab while this one sat open — refresh so
      // the count and rows don't go stale.
      const scripts = await window.api.testing.listScripts(server.id)
      onScriptedChange(new Set(scripts.map(({ kind, name }) => `${kind}::${name}`)))
    } finally {
      setRunningAll(false)
    }
  }

  // Aggregate counts across this server's capabilities with a completed run
  // this session — undefined (not 0) until at least one has finished, so the
  // header doesn't claim "0 passed" before anything has run. testsTabRuns is
  // keyed across every server in the app, so this must filter to just this
  // one rather than summing everything in the store.
  const serverPrefix = `${server.id}::`
  const doneRuns = Object.entries(testsTabRuns)
    .filter(([key]) => key.startsWith(serverPrefix))
    .map(([, r]) => r)
    .filter((r): r is Extract<TestsTabRunState, { state: 'done' }> => r.state === 'done')
  const aggregate =
    doneRuns.length > 0
      ? doneRuns.reduce(
          (acc, r) => ({
            total: acc.total + r.summary.total,
            passed: acc.passed + r.summary.passed,
            failed: acc.failed + r.summary.failed
          }),
          { total: 0, passed: 0, failed: 0 }
        )
      : undefined

  return (
    <div className="flex shrink-0 flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleRunAll}
          disabled={runningAll || scripted === undefined}
          className="inline-flex items-center gap-2 rounded-[8px] bg-[image:var(--btn)] px-[14px] py-[9px] text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCw size={13} className={runningAll ? 'animate-spin' : ''} />
          Run all tests
        </button>
        {aggregate && (
          <span className="flex items-center gap-3 text-[12.5px]">
            <span className="text-text-muted">{aggregate.total} tests</span>
            <span className="text-green">{aggregate.passed} passed</span>
            {aggregate.failed > 0 && (
              <span className="text-red-500">{aggregate.failed} failed</span>
            )}
          </span>
        )}
      </div>

      {(['tools', 'resources', 'prompts'] as const).map((category) => {
        const rows = rowsByCategory[category]
        if (rows.length === 0) return null
        const meta = CATEGORY_META[category]
        return (
          <div
            key={category}
            className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface"
          >
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="shrink-0 text-text-muted">{meta.icon}</span>
              <span className="font-mono text-[12.5px] font-semibold uppercase tracking-[0.08em] text-text-primary">
                {meta.label}
              </span>
              <span className="rounded-full border border-border-soft bg-bg-elevated px-[7px] py-px text-[11px] text-fg-faint">
                {rows.length}
              </span>
            </div>
            <div className="flex flex-col border-t border-border-soft">
              {rows.map((row) => {
                const hasScript = scripted?.has(`${meta.kind}::${row.key}`) ?? false
                const run = testsTabRuns[testsTabKey(server.id, meta.kind, row.key)]
                return (
                  <CapabilityTestRow
                    key={row.key}
                    row={row}
                    hasScript={hasScript}
                    run={run}
                    onRun={() => runCapabilityTests(server.id, meta.kind, row.key)}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
