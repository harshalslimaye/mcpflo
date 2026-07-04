import { describe, it, expect } from 'vitest'
import { runTests } from './engine'
import type { ToolCallResult } from '../../shared/mcp.types'
import {
  structuredContentResult,
  jsonTextResult,
  plainTextResult,
  isErrorResult,
  imageResult,
  emptyResult,
  multiTextBlockResult,
  promptTextResult,
  promptJsonTextResult,
  promptMixedContentResult,
  promptEmptyResult,
  resourceTextResult,
  resourceBlobResult,
  resourceTextAndBlobResult,
  resourceJsonTextResult
} from './fixtures'

// ── test() pass/fail semantics ────────────────────────────────────────────

describe('test() pass/fail semantics', () => {
  it('a passing test is recorded with correct counts', async () => {
    const summary = await runTests({
      script: 'test("passes", function () { expect(1).to.equal(1) })',
      result: emptyResult
    })
    expect(summary).toEqual({
      results: [{ name: 'passes', status: 'pass' }],
      passed: 1,
      failed: 0,
      total: 1,
      scriptError: undefined,
      logs: [],
      durationMs: summary.durationMs
    })
    expect(summary.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('a failing expect() reports the Chai message plus actual/expected', async () => {
    const summary = await runTests({
      script: 'test("fails", function () { expect(1).to.equal(2) })',
      result: emptyResult
    })
    expect(summary.results).toEqual([
      { name: 'fails', status: 'fail', error: 'expected 1 to equal 2', actual: '1', expected: '2' }
    ])
  })

  it('a failing test does not prevent later tests from running (mixed pass/fail)', async () => {
    const summary = await runTests({
      script: `
        test("should match 200", function () { expect(res.getIsError()).to.equal(true) })
        test("should return json", function () { expect(res.getBody()).to.eql({ hello: "Bruno" }) })
      `,
      result: jsonTextResult
    })
    expect(summary.total).toBe(2)
    expect(summary.passed).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.results[0]).toMatchObject({ name: 'should match 200', status: 'fail' })
    expect(summary.results[1]).toMatchObject({ name: 'should return json', status: 'pass' })
  })

  it('supports deep equality assertions on nested structured content', async () => {
    const summary = await runTests({
      script: `
        test("deep eql", function () {
          expect(res.getBody()).to.eql({ user: { name: "Ada", roles: ["admin", "dev"] }, count: 2 })
        })
      `,
      result: { structuredContent: { user: { name: 'Ada', roles: ['admin', 'dev'] }, count: 2 } }
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })
})

// ── res.getBody() precedence ───────────────────────────────────────────────

describe('res.getBody() / res.body precedence', () => {
  it('prefers structuredContent over the text block', async () => {
    const summary = await runTests({
      script: `
        test("body", function () {
          expect(res.getBody()).to.eql({ temperature: 22.5, conditions: "Partly cloudy" })
        })
      `,
      result: structuredContentResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('parses a JSON text block when there is no structuredContent', async () => {
    const summary = await runTests({
      script: 'test("body", function () { expect(res.getBody()).to.eql({ hello: "Bruno" }) })',
      result: jsonTextResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('falls back to the raw string when the text is not JSON', async () => {
    const summary = await runTests({
      script:
        'test("body", function () { expect(res.getBody()).to.equal("not json, just prose") })',
      result: plainTextResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('is null when there is no content at all', async () => {
    const summary = await runTests({
      script: 'test("body", function () { expect(res.getBody()).to.equal(null) })',
      result: emptyResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('joins multiple text blocks rather than dropping any (regression: getBody() used to keep only the first block)', async () => {
    const summary = await runTests({
      script: 'test("body", function () { expect(res.getBody()).to.equal("A\\nB\\nC") })',
      result: multiTextBlockResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })
})

// ── the rest of the res API ────────────────────────────────────────────────

describe('res.getIsError() / getText() / getContent() / getResponseTime() / getSize()', () => {
  it('getIsError() reflects the isError flag', async () => {
    const summary = await runTests({
      script: 'test("is error", function () { expect(res.getIsError()).to.equal(true) })',
      result: isErrorResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getText() joins all text blocks with newlines', async () => {
    const summary = await runTests({
      script: 'test("text", function () { expect(res.getText()).to.equal("A\\nB\\nC") })',
      result: multiTextBlockResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getContent() returns the raw content array, including non-text blocks', async () => {
    const summary = await runTests({
      script: `
        test("content", function () {
          var content = res.getContent()
          expect(content).to.have.lengthOf(1)
          expect(content[0].type).to.equal("image")
          expect(content[0].mimeType).to.equal("image/png")
        })
      `,
      result: imageResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getResponseTime() returns the passed call duration', async () => {
    const summary = await runTests({
      script: 'test("time", function () { expect(res.getResponseTime()).to.equal(1140) })',
      result: emptyResult,
      callDurationMs: 1140
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getResponseTime() is null when no call duration was passed', async () => {
    const summary = await runTests({
      script: 'test("time", function () { expect(res.getResponseTime()).to.equal(null) })',
      result: emptyResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getSize() reflects real UTF-8 byte counts computed on the host', async () => {
    const expectedBody = Buffer.byteLength(
      JSON.stringify(
        structuredContentResult.structuredContent ?? structuredContentResult.content ?? null
      )
    )
    const expectedTotal = Buffer.byteLength(JSON.stringify(structuredContentResult))
    const summary = await runTests({
      script: `
        test("size", function () {
          expect(res.getSize()).to.eql({ body: ${expectedBody}, total: ${expectedTotal} })
        })
      `,
      result: structuredContentResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })
})

// ── script-level failures ──────────────────────────────────────────────────

describe('script-level failures (distinct from failing assertions)', () => {
  it('a syntax error is reported as a scriptError without throwing', async () => {
    const summary = await runTests({ script: 'this is not valid js (((', result: emptyResult })
    expect(summary.results).toEqual([])
    expect(summary.scriptError?.type).toBe('syntax')
  })

  it('a runtime error mid-script keeps results recorded before it', async () => {
    const summary = await runTests({
      script: `
        test("first", function () { expect(1).to.equal(1) })
        null.foo
        test("never reached", function () { expect(1).to.equal(1) })
      `,
      result: emptyResult
    })
    expect(summary.results).toEqual([{ name: 'first', status: 'pass' }])
    expect(summary.scriptError).toEqual({
      type: 'runtime',
      message: "cannot read property 'foo' of null"
    })
  })

  it('a script that never returns is interrupted as a timeout, keeping prior results', async () => {
    const summary = await runTests({
      script: `
        test("first", function () { expect(1).to.equal(1) })
        while (true) {}
      `,
      result: emptyResult,
      timeoutMs: 300
    })
    expect(summary.results).toEqual([{ name: 'first', status: 'pass' }])
    expect(summary.scriptError).toEqual({ type: 'timeout', message: 'interrupted' })
  })
})

// ── sandbox isolation ───────────────────────────────────────────────────────

describe('sandbox isolation', () => {
  it('has no Node or browser globals leaking in', async () => {
    const summary = await runTests({
      script: `
        test("no leaked globals", function () {
          expect(typeof require).to.equal("undefined")
          expect(typeof process).to.equal("undefined")
          expect(typeof fetch).to.equal("undefined")
          expect(typeof setTimeout).to.equal("undefined")
        })
      `,
      result: emptyResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('mutating res.getRaw() inside the sandbox does not affect the host fixture', async () => {
    const fixture: ToolCallResult = { content: [{ type: 'text', text: 'hi' }] }
    const before = JSON.parse(JSON.stringify(fixture))

    await runTests({
      script: `
        test("mutate", function () {
          var raw = res.getRaw()
          raw.content[0].text = "mutated"
          raw.newProp = "sneaky"
        })
      `,
      result: fixture
    })

    expect(fixture).toEqual(before)
  })

  it('two runs are independent — no state carries over between them', async () => {
    const first = await runTests({
      script: `
        globalThis.leaked = "should not survive"
        test("first run", function () { expect(1).to.equal(1) })
      `,
      result: emptyResult
    })
    const second = await runTests({
      script: `
        test("second run sees a clean sandbox", function () {
          expect(typeof globalThis.leaked).to.equal("undefined")
        })
      `,
      result: emptyResult
    })

    expect(first.passed).toBe(1)
    expect(second.passed).toBe(1)
    expect(second.failed).toBe(0)
  })
})

// ── async tests ─────────────────────────────────────────────────────────────

describe('async test() functions', () => {
  it('settles and reports both a passing and a failing async test', async () => {
    const summary = await runTests({
      script: `
        test("async pass", async function () {
          var value = await Promise.resolve(42)
          expect(value).to.equal(42)
        })
        test("async fail", async function () {
          var value = await Promise.resolve(1)
          expect(value).to.equal(2)
        })
      `,
      result: emptyResult
    })

    expect(summary.passed).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.results.find((r) => r.name === 'async pass')).toMatchObject({ status: 'pass' })
    expect(summary.results.find((r) => r.name === 'async fail')).toMatchObject({
      status: 'fail',
      actual: '1',
      expected: '2'
    })
  })
})

// ── console capture ──────────────────────────────────────────────────────────

describe('console capture', () => {
  it('captures console.log/warn output as strings, in call order', async () => {
    const summary = await runTests({
      script: `
        console.log("first")
        console.warn("second", 42)
        test("noop", function () {})
      `,
      result: emptyResult
    })
    expect(summary.logs).toEqual(['first', 'second 42'])
  })
})

// ── empty script ──────────────────────────────────────────────────────────────

describe('empty script', () => {
  it('an empty or whitespace-only script returns an empty green summary', async () => {
    const summary = await runTests({ script: '   ', result: emptyResult })
    expect(summary).toEqual({
      results: [],
      passed: 0,
      failed: 0,
      total: 0,
      scriptError: undefined,
      logs: [],
      durationMs: summary.durationMs
    })
  })
})

// ── prompt kind ─────────────────────────────────────────────────────────────

describe('res API for kind: "prompt"', () => {
  it("getText() joins each message's single text content with newlines", async () => {
    const summary = await runTests({
      kind: 'prompt',
      script:
        'test("text", function () { expect(res.getText()).to.equal("Say hello to {{name}}\\nHello, Ada!") })',
      result: promptTextResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getBody() JSON-parses the joined text when it parses', async () => {
    const summary = await runTests({
      kind: 'prompt',
      script: 'test("body", function () { expect(res.getBody()).to.eql({ greeting: "hi" }) })',
      result: promptJsonTextResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getBody() falls back to the raw joined string when it is not JSON', async () => {
    const summary = await runTests({
      kind: 'prompt',
      script:
        'test("body", function () { expect(res.getBody()).to.equal("Say hello to {{name}}\\nHello, Ada!") })',
      result: promptTextResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getText()/getBody() skip non-text message content', async () => {
    const summary = await runTests({
      kind: 'prompt',
      script: 'test("text", function () { expect(res.getText()).to.equal("Look at this:") })',
      result: promptMixedContentResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getBody() is null when there are no messages', async () => {
    const summary = await runTests({
      kind: 'prompt',
      script: 'test("body", function () { expect(res.getBody()).to.equal(null) })',
      result: promptEmptyResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getRaw() returns the raw GetPromptResult, and there is no getIsError/getContent', async () => {
    const summary = await runTests({
      kind: 'prompt',
      script: `
        test("raw", function () {
          expect(res.getRaw().description).to.equal("A greeting prompt")
          expect(typeof res.getIsError).to.equal("undefined")
          expect(typeof res.getContent).to.equal("undefined")
        })
      `,
      result: promptTextResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getMessages() returns the raw messages array, untouched', async () => {
    const summary = await runTests({
      kind: 'prompt',
      script: `
        test("messages", function () {
          var messages = res.getMessages()
          expect(messages).to.have.lengthOf(2)
          expect(messages[0]).to.eql({ role: "user", content: { type: "text", text: "Say hello to {{name}}" } })
          expect(messages[1].role).to.equal("assistant")
        })
      `,
      result: promptTextResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getResponseTime()/getSize() behave the same as for tool results', async () => {
    const summary = await runTests({
      kind: 'prompt',
      script: `
        test("meta", function () {
          expect(res.getResponseTime()).to.equal(250)
          expect(res.getSize().total).to.be.a("number")
        })
      `,
      result: promptTextResult,
      callDurationMs: 250
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })
})

// ── resource kind ───────────────────────────────────────────────────────────

describe('res API for kind: "resource"', () => {
  it("getText() returns a text resource's content", async () => {
    const summary = await runTests({
      kind: 'resource',
      script: 'test("text", function () { expect(res.getText()).to.equal("hello resource") })',
      result: resourceTextResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getText() is empty and getBody() is null for a blob-only resource', async () => {
    const summary = await runTests({
      kind: 'resource',
      script: `
        test("blob", function () {
          expect(res.getText()).to.equal("")
          expect(res.getBody()).to.equal(null)
        })
      `,
      result: resourceBlobResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getText() skips a blob entry mixed in with a text entry', async () => {
    const summary = await runTests({
      kind: 'resource',
      script: 'test("mixed", function () { expect(res.getText()).to.equal("the text part") })',
      result: resourceTextAndBlobResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getBody() JSON-parses the text when it parses', async () => {
    const summary = await runTests({
      kind: 'resource',
      script: 'test("body", function () { expect(res.getBody()).to.eql({ count: 3 }) })',
      result: resourceJsonTextResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getContents() returns the raw contents array, including a blob-only entry', async () => {
    const summary = await runTests({
      kind: 'resource',
      script: `
        test("contents", function () {
          var contents = res.getContents()
          expect(contents).to.have.lengthOf(1)
          expect(contents[0].blob).to.equal("ZmFrZS1iYXNlNjQ=")
          expect(contents[0].mimeType).to.equal("image/png")
        })
      `,
      result: resourceBlobResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })

  it('getRaw() returns the raw ResourceReadResult, and there is no getIsError/getContent', async () => {
    const summary = await runTests({
      kind: 'resource',
      script: `
        test("raw", function () {
          expect(res.getRaw().contents[0].blob).to.equal("ZmFrZS1iYXNlNjQ=")
          expect(typeof res.getIsError).to.equal("undefined")
          expect(typeof res.getContent).to.equal("undefined")
        })
      `,
      result: resourceBlobResult
    })
    expect(summary).toMatchObject({ passed: 1, failed: 0 })
  })
})
