import { test, expect, openEverythingGroup, fillTestScript } from '../fixtures'

test('a script-level runtime error is reported separately from failing assertions', async ({
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
  // A test that runs and passes, then a statement that throws outside any
  // test() block — the engine keeps results recorded before the throw and
  // reports it as a scriptError rather than a third failing test.
  await fillTestScript(
    page,
    ['test("passes", function () {', '  expect(1).to.equal(1)', '})', 'null.foo'].join('\n')
  )
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Params', exact: true }).click()
  await page.getByLabel('message', { exact: true }).fill('hello')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('Echo: hello')).toBeVisible({ timeout: 10_000 })

  const responseTestsTab = page.getByRole('button', { name: /^Tests \(1\)/ })
  await expect(responseTestsTab).toBeVisible({ timeout: 10_000 })
  await responseTestsTab.click()

  await expect(page.getByText('Script error — runtime')).toBeVisible()
  await expect(page.getByText(/cannot read propert(y|ies) .*foo/i)).toBeVisible()
  // The one test() call that ran before the throw is still shown.
  await expect(page.getByText('passes', { exact: true })).toBeVisible()
})
