import type { ToolCallResult, GetPromptResult, ResourceReadResult } from '../../shared/mcp.types'
import type { SandboxInput, TestKind, TestResult, TestRunSummary } from '../../shared/testing.types'
import { evaluateInSandbox } from './sandbox'

// Shape of the JSON string bootstrap.js's __MCPFLO_COLLECT__ returns. An
// internal contract between this file and bootstrap.js — both ends are ours,
// so this is trusted rather than validated, the same way the rest of this
// file trusts its own inputs.
interface CollectedResults {
  results: TestResult[]
  logs: string[]
}

// The "payload" portion of a result, for res.getSize()'s `body` byte count —
// mirrors each kind's own getBody()/getText() precedence in bootstrap.js, but
// as a size measurement rather than a recreation of its parsing: bytes don't
// care whether text happens to parse as JSON.
function bodyPayload(
  kind: TestKind,
  result: ToolCallResult | GetPromptResult | ResourceReadResult
): unknown {
  switch (kind) {
    case 'prompt':
      return (result as GetPromptResult).messages ?? null
    case 'resource':
      return (result as ResourceReadResult).contents ?? null
    case 'tool':
      return (
        (result as ToolCallResult).structuredContent ?? (result as ToolCallResult).content ?? null
      )
  }
}

// Runs a Bruno-style test script (test() + expect()) against a tool-call
// result and returns a pass/fail summary. This is the one entry point the
// rest of the app calls — everything about the sandbox, Chai, and QuickJS
// stays behind it.
//
// Never throws for problems with the *script* (syntax errors, failing
// assertions, timeouts, ...) — those come back as data, in
// `TestRunSummary.scriptError`/`.results`. It can still throw for a
// programmer error or a genuine infrastructure failure (e.g. the sandbox
// failing to load) — those aren't testable script conditions and shouldn't
// be silently swallowed into a fake passing/failing result.
export async function runTests(input: {
  script: string
  kind?: TestKind
  result: ToolCallResult | GetPromptResult | ResourceReadResult
  callDurationMs?: number
  timeoutMs?: number
}): Promise<TestRunSummary> {
  const startedAt = Date.now()

  if (input.script.trim() === '') {
    return {
      results: [],
      passed: 0,
      failed: 0,
      total: 0,
      logs: [],
      durationMs: Date.now() - startedAt
    }
  }

  const kind = input.kind ?? 'tool'

  // Real UTF-8 byte counts for res.getSize(), computed here rather than in
  // the sandbox since the guest has no TextEncoder. `total` is the whole
  // result; `body` is just the payload portion, per bodyPayload() above.
  const bodyBytes = Buffer.byteLength(JSON.stringify(bodyPayload(kind, input.result)))
  const totalBytes = Buffer.byteLength(JSON.stringify(input.result))

  const sandboxInput: SandboxInput = {
    kind,
    result: input.result,
    bodyBytes,
    totalBytes,
    callDurationMs: input.callDurationMs ?? null
  }

  const outcome = await evaluateInSandbox({
    userScript: input.script,
    dataJson: JSON.stringify(sandboxInput),
    timeoutMs: input.timeoutMs
  })

  const collected: CollectedResults = outcome.collectedJson
    ? (JSON.parse(outcome.collectedJson) as CollectedResults)
    : { results: [], logs: [] }

  const passed = collected.results.filter((result) => result.status === 'pass').length

  return {
    results: collected.results,
    passed,
    failed: collected.results.length - passed,
    total: collected.results.length,
    scriptError: outcome.scriptError,
    logs: collected.logs,
    durationMs: Date.now() - startedAt
  }
}
