import type { Page } from '@playwright/test'
import {
  test,
  expect,
  openEverythingGroup,
  openEverythingDetails,
  fillTestScript
} from '../fixtures'

// Scripts every non-interactive tool on the Everything server, then runs the
// whole set with one "Run all tests" click. server-tests-tab.spec.ts already
// covers the single-tool skip/pass/bulk mechanics; this proves the same path
// holds up at the server's actual tool count, with a real mix of arg-needing
// and no-arg tools and a couple of intentionally-failing assertions so the
// aggregate math isn't just "N tests, all green".
//
// Excluded on purpose: trigger-elicitation-request(-async) and
// trigger-sampling-request(-async) each open a modal nothing auto-answers —
// included in a bulk run, the awaited tool call would never resolve and
// "Run all tests" (which runs sequentially — see runAllTests in
// serverStore.ts) would hang indefinitely.

// Sets up one tool: optionally fills+saves+marks a Saved Request (for a tool
// whose schema can't be auto-filled, or whose defaults are just slow — see
// trigger-long-running-operation below), then saves a test script. Kept as
// one helper rather than ~13 repeated blocks.
async function configureTool(
  page: Page,
  toolName: string,
  script: string,
  setArgs?: () => Promise<void>
): Promise<void> {
  await page.getByRole('button', { name: toolName, exact: true }).click()

  if (setArgs) {
    await page.getByRole('button', { name: 'Params', exact: true }).click()
    await setArgs()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm save request' }).click()
    // Regex, not exact — once a request exists, the tab picks up a "(1)"
    // count badge (Tabs.tsx), same as the server-level Tests tab's own count.
    await page.getByRole('button', { name: /^Saved/ }).click()
    await page.getByRole('button', { name: /^Use .* for tests$/ }).click()
  }

  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(page, script)
  await page.waitForTimeout(600)
}

test('scripts every non-interactive tool and runs them all at once', async ({ page }) => {
  test.setTimeout(240_000)

  await openEverythingGroup(page, 'Tools')

  // Auto-runnable: schema defaults (or no schema at all) satisfy every field,
  // so resolveToolArgs never needs a marked Saved Request.
  await configureTool(
    page,
    'get-env',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("returns an object", function () {',
      '  expect(res.getBody()).to.be.an("object")',
      '})'
    ].join('\n')
  )

  await configureTool(
    page,
    'get-resource-links',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("returns 3 links plus the intro text", function () {',
      '  expect(res.getContent().length).to.equal(4)',
      '})'
    ].join('\n')
  )

  await configureTool(
    page,
    'get-resource-reference',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("returns intro, resource, and uri blocks", function () {',
      '  expect(res.getContent().length).to.equal(3)',
      '})'
    ].join('\n')
  )

  await configureTool(
    page,
    'get-tiny-image',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("mentions the MCP logo", function () {',
      '  expect(res.getText()).to.include("MCP logo")',
      '})'
    ].join('\n')
  )

  await configureTool(
    page,
    'gzip-file-as-resource',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("returns a resource link", function () {',
      '  expect(res.getContent()[0].type).to.equal("resource_link")',
      '})'
    ].join('\n')
  )

  await configureTool(
    page,
    'toggle-simulated-logging',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("starts simulated logging", function () {',
      '  expect(res.getText()).to.include("Started simulated")',
      '})'
    ].join('\n')
  )

  await configureTool(
    page,
    'toggle-subscriber-updates',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("starts simulated resource updates", function () {',
      '  expect(res.getText()).to.include("Started simulated resource")',
      '})'
    ].join('\n')
  )

  // Needs a marked Saved Request: required args with no schema default.
  await configureTool(
    page,
    'echo',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("echoes the message", function () {',
      '  expect(res.getText()).to.equal("Echo: hello bulk test")',
      '})',
      'test("wrong on purpose", function () {',
      '  expect(res.getText()).to.equal("Echo: nope")',
      '})'
    ].join('\n'),
    async () => {
      await page.getByLabel('message', { exact: true }).fill('hello bulk test')
    }
  )

  await configureTool(
    page,
    'get-sum',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("sums correctly", function () {',
      '  expect(res.getText()).to.equal("The sum of 2 and 3 is 5.")',
      '})'
    ].join('\n'),
    async () => {
      await page.getByLabel('a', { exact: true }).fill('2')
      await page.getByLabel('b', { exact: true }).fill('3')
    }
  )

  await configureTool(
    page,
    'get-annotated-message',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("returns the success message", function () {',
      '  expect(res.getText()).to.equal("Operation completed successfully")',
      '})'
    ].join('\n'),
    async () => {
      await page.getByLabel('messageType', { exact: true }).selectOption({ label: 'success' })
    }
  )

  await configureTool(
    page,
    'get-structured-content',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("returns Chicago temperature", function () {',
      '  expect(res.getBody().temperature).to.equal(36)',
      '})',
      'test("wrong on purpose", function () {',
      '  expect(res.getBody().humidity).to.equal(999)',
      '})'
    ].join('\n'),
    async () => {
      await page.getByLabel('location', { exact: true }).selectOption({ label: 'Chicago' })
    }
  )

  await configureTool(
    page,
    'simulate-research-query',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("reports on the requested topic", function () {',
      '  expect(res.getText()).to.include("mcp testing")',
      '})'
    ].join('\n'),
    async () => {
      await page.getByLabel('topic', { exact: true }).fill('mcp testing')
    }
  )

  // Auto-runnable by schema, but its defaults (duration: 10s, steps: 5) would
  // otherwise stretch this bulk run by 10+ seconds — mark a much shorter
  // override instead, same trick trigger-long-running-operation.spec.ts uses
  // for a single Execute.
  await configureTool(
    page,
    'trigger-long-running-operation',
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("completes with the overridden duration", function () {',
      '  expect(res.getText()).to.equal("Long running operation completed. Duration: 1 seconds, Steps: 1.")',
      '})'
    ].join('\n'),
    async () => {
      await page.getByLabel('duration', { exact: true }).fill('1')
      await page.getByLabel('steps', { exact: true }).fill('1')
    }
  )

  await openEverythingDetails(page)
  await page.getByRole('button', { name: 'Tests (13)', exact: true }).click()

  // Every required-arg tool above got a marked Saved Request, so nothing
  // should fall back to the skip state.
  await expect(page.getByText('Skipped — needs input')).not.toBeVisible()

  await page.getByRole('button', { name: 'Run all tests' }).click()

  // echo and get-structured-content each carry one intentionally-wrong
  // assertion among their tests, so the aggregate is a real mixed result —
  // 26 tests total (11 tools × 2 + 2 tools × 3), 24 passed, 2 failed — not
  // just "every tool passed".
  await expect(page.getByText('26 tests')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('24 passed')).toBeVisible()
  await expect(page.getByText('2 failed')).toBeVisible()
})
