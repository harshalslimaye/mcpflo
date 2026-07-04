// Types for the test-engine feature (Bruno-style `test()` + Chai `expect()`
// scripts run against a tool-call result). These cross the IPC boundary in
// later phases; the engine itself (src/main/testing/) is the first consumer.

import type { ToolCallResult, GetPromptResult, ResourceReadResult } from './mcp.types'

// Which kind of call the script is testing against. Selects which of the
// three `res` builders bootstrap.js uses (buildToolRes/buildPromptRes/
// buildResourceRes) and which fields SandboxInput.result actually holds.
export type TestKind = 'tool' | 'prompt' | 'resource'

// JSON payload the host writes into the sandbox as `globalThis.__MCPFLO_DATA__`
// (src/main/testing/sandbox.ts). The bootstrap parses this once and builds
// `res` from it before evaluating the user's script.
export interface SandboxInput {
  kind: TestKind
  result: ToolCallResult | GetPromptResult | ResourceReadResult
  // Real UTF-8 byte lengths for `res.getSize()`, computed host-side via
  // `Buffer.byteLength` — the guest has no `TextEncoder`.
  bodyBytes: number
  totalBytes: number
  // Null when the caller hasn't measured a real tool-call duration (e.g. a
  // fixture in engine.test.ts); the caller that wires a live tool call in
  // passes the measured duration instead.
  callDurationMs: number | null
}

// The `res` contract the bootstrap (src/main/testing/bootstrap.js) builds
// inside the sandbox from a `SandboxInput`. Not a compiled TS type — the
// bootstrap is plain untyped JS evaluated inside QuickJS — but pinned here so
// the bootstrap implementation and engine.test.ts fixtures stay in lockstep.
//
// Tool results (buildToolRes):
//   res.body / res.getBody()             — result.structuredContent if
//     defined; else all `text` content blocks joined the same way
//     res.getText() does, JSON-parsed if the joined text parses, raw joined
//     string otherwise; else null if there's no text block. Never drops a
//     block — multiple text blocks are never truncated to just the first.
//   res.isError / res.getIsError()       — result.isError === true
//   res.content / res.getContent()       — result.content array, or []
//   res.getText()                        — all text blocks' `.text` joined
//     with "\n", "" if there are none
//   res.responseTime / res.getResponseTime() — SandboxInput.callDurationMs
//     (may be null)
//   res.getSize()                        — { body, total } in bytes, echoed
//     from SandboxInput.bodyBytes / totalBytes
//   res.raw / res.getRaw()               — the whole ToolCallResult, untouched
//
// Prompt results (buildPromptRes) and resource results (buildResourceRes)
// share the same `getText`/`getBody`/`getResponseTime`/`getSize`/`getRaw`
// shape, but have no `isError`/`getIsError` — there is no MCP-level error flag
// at that level. In place of `getContent()`, each has its own raw-array
// accessor, since prompt/resource results don't share a tool result's
// `content` shape:
//
//   Prompt: res.messages / res.getMessages()  — result.messages array, or []
//   Resource: res.contents / res.getContents() — result.contents array, or []
//
//   Prompt: res.getText() walks `messages`, taking each message's single
//     `content` block's `.text` when its `type === 'text'` (a message's
//     `content` is one block, not an array — unlike a tool result), joined
//     with "\n". res.getBody() JSON-parses that joined text if it parses,
//     else returns the raw joined string, else null if there's no text.
//   Resource: res.getText() joins every `contents[].text` (skipping blob-only
//     entries) with "\n". res.getBody() has the same JSON-parse-or-raw-or-null
//     behavior as the prompt/tool one, applied to that joined text.

// Outcome of a single `test("name", fn)` block.
export interface TestResult {
  name: string
  status: 'pass' | 'fail'
  // Present on failure: Chai's assertion message.
  error?: string
  // Present on failure when Chai's AssertionError carries `.actual`/`.expected`
  // (e.g. `to.equal`/`to.eql`) — JSON-serialized for display. Absent for
  // assertions that don't compare two values (e.g. `to.be.a('string')`).
  actual?: string
  expected?: string
}

// A failure of the script itself, distinct from a failing assertion: the
// script never (fully) ran, so `TestRunSummary.results` may be partial or
// empty. Surfaced separately so the UI can tell "your test failed" apart from
// "your script is broken".
export interface ScriptError {
  type: 'syntax' | 'runtime' | 'timeout' | 'oom'
  message: string
}

// Result of running a test script against a single tool-call result.
export interface TestRunSummary {
  results: TestResult[]
  passed: number
  failed: number
  total: number
  // Set when the script didn't run to completion; `results` still holds
  // whatever tests were recorded before the failure.
  scriptError?: ScriptError
  // console.log/info/warn/error output from the script, in call order,
  // each argument String()-ified and space-joined per call.
  logs: string[]
  // Engine execution time (sandbox eval + job-pump), not the tool call's own
  // duration — that's `callDurationMs` passed into the engine as input.
  durationMs: number
}
