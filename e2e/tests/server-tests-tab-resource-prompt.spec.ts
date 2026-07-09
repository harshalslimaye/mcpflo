import {
  test,
  expect,
  openEverythingGroup,
  openEverythingDetails,
  fillTestScript
} from '../fixtures'

// server-tests-tab.spec.ts only exercises tool rows; this covers a resource
// and a no-argument prompt row through the same per-row Run flow. A resource
// read takes no arguments at all (see runCapabilityTests), so it's always
// auto-runnable — no skip case to prove here, that's covered by
// server-tests-tab.spec.ts's get-sum case and
// prompt-saved-request-test-default.spec.ts's prompt-specific one.
test('the server Tests tab runs resource and prompt rows', async ({ page }) => {
  test.setTimeout(90_000)

  await openEverythingGroup(page, 'Resources')
  await page.getByRole('button', { name: 'architecture.md', exact: true }).click()
  await page.getByRole('button', { name: 'Tests', exact: true }).first().click()
  await fillTestScript(
    page,
    'test("reads as text", function () {\n  expect(res.getText()).to.include("Everything Server")\n})'
  )
  await page.waitForTimeout(600)

  // Not openEverythingGroup again — its row-level Expand/Collapse toggle would
  // re-collapse the server row (already expanded from the call above) instead
  // of opening a second group. Click the Prompts group button directly; the
  // row itself stays expanded, and the group toggle is independent per group
  // (see SecondarySidebar's expandedGroups Set).
  const promptsGroup = page.getByRole('button', { name: /^Prompts/ })
  await expect(promptsGroup).toBeEnabled({ timeout: 30_000 })
  await promptsGroup.click()
  await page.getByRole('button', { name: 'simple-prompt', exact: true }).click()
  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(
    page,
    'test("has a message", function () {\n  expect(res.getMessages().length).to.be.above(0)\n})'
  )
  await page.waitForTimeout(600)

  await openEverythingDetails(page)
  await page.getByRole('button', { name: 'Tests (2)', exact: true }).click()

  await page.getByRole('button', { name: 'Run architecture.md' }).click()
  await expect(page.getByText('1 passed').first()).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Run simple-prompt' }).click()
  await expect(page.getByText('1 passed').nth(1)).toBeVisible({ timeout: 10_000 })
})
