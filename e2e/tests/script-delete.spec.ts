import {
  test,
  expect,
  openEverythingGroup,
  openEverythingDetails,
  fillTestScript
} from '../fixtures'

// Clearing a script's editor to empty deletes its backing file (scriptStore's
// writeScript convention — see scriptStore.ts) rather than writing an empty
// one. This proves the UI actually follows that all the way through: the dot
// indicator, the per-capability row, and the server Tests tab count.
test('clearing a test script to empty removes it everywhere it is reflected', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'echo', exact: true }).click()
  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(
    page,
    'test("is not an error", function () {\n  expect(res.getIsError()).to.equal(false)\n})'
  )
  await page.waitForTimeout(600)

  await expect(page.locator('[aria-label="Has a saved test script"]')).toBeVisible()

  await openEverythingDetails(page)
  await page.getByRole('button', { name: 'Tests (1)', exact: true }).click()
  // The per-row Run button only renders for a capability with a saved script
  // (ServerTestsTab.tsx) — its presence is an unambiguous proxy for "echo has
  // a script" that doesn't depend on distinguishing echo's own row from every
  // other unscripted capability's "No test script" text.
  await expect(page.getByRole('button', { name: 'Run echo' })).toBeVisible()

  await page.getByRole('button', { name: 'echo', exact: true }).click()
  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(page, '')
  await page.waitForTimeout(600)

  await expect(page.locator('[aria-label="Has a saved test script"]')).not.toBeVisible()

  await openEverythingDetails(page)
  // Back to a plain "Tests" tab, no "(1)" badge, now that no capability has a
  // script.
  await page.getByRole('button', { name: 'Tests', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Run echo' })).not.toBeVisible()

  // The script is gone from disk, not just the in-memory editor — reloading
  // echo's Tests tab shows an empty editor rather than the deleted script.
  // CodeMirror renders its placeholder text as a decoration inside
  // `.cm-content` itself once the doc is empty (not a native `placeholder`
  // attribute), so its presence — rather than `.cm-content`'s raw text — is
  // what actually proves the document is empty.
  await page.getByRole('button', { name: 'echo', exact: true }).click()
  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await expect(page.locator('.cm-placeholder')).toBeVisible()
})
