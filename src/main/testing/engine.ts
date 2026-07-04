import type { ToolCallResult } from '../../shared/mcp.types'
import type { SandboxInput, TestResult, TestRunSummary } from '../../shared/testing.types'
import { evaluateInSandbox } from './sandbox'

// Shape of the JSON string bootstrap.js's __MCPFLO_COLLECT__ returns. An
// internal contract between this file and bootstrap.js — both ends are ours,
// so this is trusted rather than validated, the same way the rest of this
// file trusts its own inputs.
interface CollectedResults {
  results: TestResult[]
  logs: string[]
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
  result: ToolCallResult
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

  // Real UTF-8 byte counts for res.getSize(), computed here rather than in
  // the sandbox since the guest has no TextEncoder. `body` is just the
  // payload portion (structuredContent, or content if there's no structured
  // form); `total` is the whole result. This is a size measurement, not a
  // recreation of getBody()'s parsing precedence — bytes don't care whether
  // text happens to parse as JSON.
  const bodyBytes = Buffer.byteLength(
    JSON.stringify(input.result.structuredContent ?? input.result.content ?? null)
  )
  const totalBytes = Buffer.byteLength(JSON.stringify(input.result))

  const sandboxInput: SandboxInput = {
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
