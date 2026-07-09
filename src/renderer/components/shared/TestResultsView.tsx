import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { TestResult, TestRunSummary } from '../../../shared/testing.types'

// One test() result as an expansion row: collapsed shows the pass/fail dot and
// name; a failing test with a message and/or actual/expected values expands to
// show them. A passing test (or a failure with no extra detail — e.g. a plain
// thrown string) has nothing to expand, so the chevron is omitted. Exported
// so the server-level Tests tab (ServerTestsTab) can render one row per test
// without the surrounding per-capability "Tests (n)" header this file's
// TestResultsView wraps it in.
export function TestRow({ result }: { result: TestResult }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const isPass = result.status === 'pass'
  const hasDetail =
    !isPass &&
    (result.error !== undefined || result.actual !== undefined || result.expected !== undefined)

  return (
    <div
      className={`rounded border ${isPass ? 'border-border bg-bg-elevated' : 'border-red-500/40 bg-red-500/5'}`}
    >
      <button
        type="button"
        onClick={() => hasDetail && setOpen((prev) => !prev)}
        aria-expanded={hasDetail ? open : undefined}
        className={`flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-xs transition-colors ${
          hasDetail ? 'hover:bg-bg-primary/40' : 'cursor-default'
        }`}
      >
        {hasDetail ? (
          <ChevronRight
            size={12}
            className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${isPass ? 'bg-green' : 'bg-red-500'}`}
        />
        <span className="truncate text-text-primary">{result.name}</span>
      </button>
      {hasDetail && open && (
        <div className="flex flex-col gap-1.5 border-t border-border-soft px-2 py-2">
          {result.error !== undefined && (
            <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-400">
              {result.error}
            </p>
          )}
          {(result.expected !== undefined || result.actual !== undefined) && (
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              {result.expected !== undefined && (
                <div>
                  <div className="mb-0.5 text-text-muted">Expected</div>
                  <pre className="whitespace-pre-wrap break-words text-text-primary">
                    {result.expected}
                  </pre>
                </div>
              )}
              {result.actual !== undefined && (
                <div>
                  <div className="mb-0.5 text-text-muted">Actual</div>
                  <pre className="whitespace-pre-wrap break-words text-text-primary">
                    {result.actual}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Console output as a collapsed-by-default section, same expansion pattern as
// a NotificationsTab entry. Absent entirely when the script logged nothing.
function ConsoleSection({ logs }: { logs: string[] }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (logs.length === 0) return null

  return (
    <div className="rounded border border-border bg-bg-elevated">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-xs transition-colors hover:bg-bg-primary/40"
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-text-muted">Console ({logs.length})</span>
      </button>
      {open && (
        <pre className="border-t border-border-soft px-2 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-text-primary">
          {logs.join('\n')}
        </pre>
      )}
    </div>
  )
}

// The Tests result tab body — a Bruno-style pass/fail summary for a completed
// `runTests()` call. `summary` is undefined whenever no test run was attempted
// for this call (no saved script, or the call itself failed with no result to
// test against — see ToolCallRecord.testRun), which reads as a teaching empty
// state rather than "0 of 0 passed".
export function TestResultsView({ summary }: { summary?: TestRunSummary }): React.JSX.Element {
  if (!summary) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        Write a test script on the Tests tab, then run the call again to see results here.
      </p>
    )
  }

  // A script error means the script didn't run to completion — distinct from
  // a failing assertion, so it gets its own banner rather than being folded
  // into the pass/fail rows. Any test() calls that did complete before the
  // failure are still shown below it.
  const scriptErrorBanner = summary.scriptError && (
    <div className="rounded border border-orange-500/40 bg-orange-500/5 px-3 py-2">
      <p className="font-mono text-[11px] font-semibold tracking-wide text-orange-500 uppercase">
        Script error — {summary.scriptError.type}
      </p>
      <p className="mt-1 font-mono text-xs whitespace-pre-wrap break-words text-text-primary">
        {summary.scriptError.message}
      </p>
    </div>
  )

  if (summary.total === 0 && !summary.scriptError) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        {`The script ran but didn't call test() — add at least one test("name", fn) block.`}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {scriptErrorBanner}
      {summary.total > 0 && (
        <>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-text-primary">Tests ({summary.total})</span>
            <span className="text-green">Passed: {summary.passed}</span>
            {summary.failed > 0 && <span className="text-red-500">Failed: {summary.failed}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            {summary.results.map((result, i) => (
              <TestRow key={i} result={result} />
            ))}
          </div>
        </>
      )}
      <ConsoleSection logs={summary.logs} />
    </div>
  )
}
