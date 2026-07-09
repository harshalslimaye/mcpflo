import { test, expect, openEverythingGroup, fillTestScript } from '../fixtures'

test('runs a saved test script on Execute and reports mixed pass/fail results', async ({
  page,
  electronApp
}) => {
  test.setTimeout(60_000)

  // The default 900×670 window (main/index.ts) is too narrow for the docked
  // Response panel's full tab row (Preview/Raw/Pretty/Notifications/Tokens/
  // Tests) — it overflows its horizontal scroller, and the offscreen Tests
  // tab's real layout position then collides with the Maximize button next
  // to it, making it unclickable. Widen the window so every tab fits.
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1400, 800)
  })

  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'echo', exact: true }).click()

  // Request panel's Tests tab is the first of the two "Tests" tabs on this
  // page (the Response panel has its own, further down) — see fixtures.ts.
  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(
    page,
    [
      'test("is not an error", function () {',
      '  expect(res.getIsError()).to.equal(false)',
      '})',
      'test("echoes the message", function () {',
      '  expect(res.getText()).to.equal("nope")',
      '})'
    ].join('\n')
  )

  // The dot indicator on the Tests tab shows as soon as a script exists,
  // independent of any run.
  await expect(page.getByLabel('Has a saved test script')).toBeVisible()

  // Execute reads the script back off disk (useTestScript.ts), not from this
  // component's in-memory state — wait past the 500ms autosave debounce so
  // the write has actually landed before triggering the auto-run.
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Params', exact: true }).click()
  await page.getByLabel('message', { exact: true }).fill('hello e2e')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Echo: hello e2e')).toBeVisible({ timeout: 10_000 })

  // The call auto-runs the saved script; the Response panel's Tests tab
  // picks up a (2) count once it has.
  const responseTestsTab = page.getByRole('button', { name: /^Tests \(2\)/ })
  await expect(responseTestsTab).toBeVisible({ timeout: 10_000 })
  await responseTestsTab.click()
  await expect(page.getByText('Passed: 1')).toBeVisible()
  await expect(page.getByText('Failed: 1')).toBeVisible()

  // The failing row expands to show the Chai message plus actual/expected.
  await page.getByRole('button', { name: 'echoes the message', exact: true }).click()
  await expect(page.getByText(/expected .*Echo: hello e2e.* to equal.*nope/)).toBeVisible()
  await expect(page.getByText('Expected', { exact: true })).toBeVisible()
  await expect(page.getByText('Actual', { exact: true })).toBeVisible()
})
