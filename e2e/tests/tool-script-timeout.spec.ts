import { test, expect, openEverythingGroup, fillTestScript } from '../fixtures'

// engine.test.ts covers the timeout mapping at the unit level (sandbox.ts's
// shouldInterruptAfterDeadline -> InternalError: interrupted -> ScriptError
// {type: 'timeout'}); this is the one end-to-end proof that an actual
// never-returning script run from the UI surfaces the same "Script error —
// timeout" banner a real user would see, not just a synthetic engine input.
test('an infinite-looping script is interrupted and reported as a timeout', async ({
  page,
  electronApp
}) => {
  test.setTimeout(60_000)

  // See tool-run-script.spec.ts: the default window is too narrow for the
  // Response panel's full tab row.
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1400, 800)
  })

  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'echo', exact: true }).click()

  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(page, 'while (true) {}')
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Params', exact: true }).click()
  await page.getByLabel('message', { exact: true }).fill('hello')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  // The tool call itself is committed and visible before the test run even
  // starts (see runTestForCall's comment in serverStore.ts), so "Echo: hello"
  // appearing isn't proof the run finished — a script that never calls
  // test() also never gets a "(n)" tab badge (Tabs.tsx only renders it for
  // count > 0). Go straight to polling for the error banner instead, with
  // headroom past the sandbox's default 5s deadline (DEFAULT_TIMEOUT_MS in
  // sandbox.ts) for the interrupt handler to actually fire.
  await expect(page.getByText('Echo: hello')).toBeVisible({ timeout: 10_000 })

  // Regex, not an exact match — the Response panel's Tests tab never gets a
  // dotLabel (only Request panels' Tests tabs do; see ToolCallResultView.tsx
  // vs ToolRequestPanel.tsx), but the Request panel's does once a script is
  // saved, so an exact "Tests" match would be ambiguous depending on which
  // tab happens to render second. `.last()` always lands on the Response
  // panel's tab regardless, since it's the one that renders after the
  // Request panel in ToolDetailView's DOM order.
  const responseTestsTab = page.getByRole('button', { name: /^Tests/ }).last()
  await responseTestsTab.click()
  await expect(page.getByText('Script error — timeout')).toBeVisible({ timeout: 15_000 })
})
