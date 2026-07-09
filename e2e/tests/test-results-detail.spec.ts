import { test, expect, openEverythingGroup, fillTestScript } from '../fixtures'

// TestResultsView.test.tsx covers ConsoleSection and the actual/expected grid
// as component-level unit tests; this proves the same detail actually
// reaches the screen from a real run — console.log output collected through
// the sandbox (bootstrap.js's console shim) and a failing to.equal's
// actual/expected pair, both behind their own click-to-expand affordance.
test('a failing assertion and console output both expand to their detail', async ({
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
  await fillTestScript(
    page,
    [
      'console.log("first log line")',
      'console.log("second", 42)',
      'test("wrong expectation on purpose", function () {',
      '  expect(res.getText()).to.equal("not-this")',
      '})'
    ].join('\n')
  )
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Params', exact: true }).click()
  await page.getByLabel('message', { exact: true }).fill('hello')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('Echo: hello')).toBeVisible({ timeout: 10_000 })

  const responseTestsTab = page.getByRole('button', { name: /^Tests \(1\)/ })
  await expect(responseTestsTab).toBeVisible({ timeout: 10_000 })
  await responseTestsTab.click()
  await expect(page.getByText('Failed: 1')).toBeVisible()

  // The failing test row is collapsed by default — expand it to reveal
  // Chai's actual/expected pair, JSON-serialized (quotes included).
  await page.getByRole('button', { name: 'wrong expectation on purpose' }).click()
  await expect(page.getByText('"not-this"')).toBeVisible()
  await expect(page.getByText('"Echo: hello"')).toBeVisible()

  // Console output is its own collapsed section, separate from the test row.
  const consoleSection = page.getByRole('button', { name: /^Console \(2\)/ })
  await expect(consoleSection).toBeVisible()
  await consoleSection.click()
  await expect(page.getByText('first log line')).toBeVisible()
  await expect(page.getByText('second 42')).toBeVisible()
})
