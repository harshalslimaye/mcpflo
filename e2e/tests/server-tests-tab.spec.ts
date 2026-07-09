import {
  test,
  expect,
  openEverythingGroup,
  openEverythingDetails,
  fillTestScript
} from '../fixtures'

test('the server Tests tab runs per-capability and bulk, and skips capabilities needing input', async ({
  page
}) => {
  test.setTimeout(90_000)

  // Save a script on a no-argument tool (get-tiny-image — empty inputSchema,
  // always auto-runnable) and on a required-argument tool with no schema
  // defaults (get-sum — a, b numbers) — the latter can never be auto-filled
  // without a marked Saved Request, so it's this suite's "skipped" case.
  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'get-tiny-image', exact: true }).click()
  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(
    page,
    'test("is not an error", function () {\n  expect(res.getIsError()).to.equal(false)\n})'
  )
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'get-sum', exact: true }).click()
  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(
    page,
    'test("has a sum", function () {\n  expect(res.getText()).to.include(" is ")\n})'
  )
  await page.waitForTimeout(600)

  await openEverythingDetails(page)
  // Distinct from the Overview tab's collapsed "Tests Folder" settings card,
  // which also starts with "Tests" — this is the tab bar's own entry, which
  // carries the scripted-capability count (2, from the two scripts above).
  await page.getByRole('button', { name: 'Tests (2)', exact: true }).click()

  // A capability with no script at all reads distinctly from one that has a
  // script but hasn't run yet.
  await expect(page.getByText('No test script').first()).toBeVisible()

  // Each row's Run button carries a unique aria-label, so there's no need to
  // scope into the surrounding row div first.
  await page.getByRole('button', { name: 'Run get-tiny-image' }).click()
  await expect(page.getByText('1 passed').first()).toBeVisible({ timeout: 10_000 })

  // get-sum has a script but requires (a, b) with no schema defaults and no
  // Saved Request marked "use for tests" — resolveToolArgs can't fill it in,
  // so it's skipped rather than invoked with guessed args.
  await page.getByRole('button', { name: 'Run get-sum' }).click()
  await expect(page.getByText('Skipped — needs input')).toBeVisible({ timeout: 10_000 })

  // Bulk run re-runs every scripted capability; the aggregate header counts
  // only completed ("done") runs, so get-sum's skip doesn't contribute.
  await page.getByRole('button', { name: 'Run all tests' }).click()
  await expect(page.getByText('1 tests')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('1 passed').first()).toBeVisible()
})
