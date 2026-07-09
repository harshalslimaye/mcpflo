import {
  test,
  expect,
  openEverythingGroup,
  openEverythingDetails,
  fillTestScript
} from '../fixtures'

// Mirrors saved-request-test-default.spec.ts, but for a prompt: args-prompt
// has a required `city` argument with no schema default, so resolvePromptArgs
// (a separate resolver from the tool path, working over raw form values
// rather than the wire-format string map) can never auto-fill it without a
// marked Saved Request.
test('marking a prompt Saved Request "use for tests" un-skips it in the server Tests tab', async ({
  page
}) => {
  test.setTimeout(90_000)

  await openEverythingGroup(page, 'Prompts')
  await page.getByRole('button', { name: 'args-prompt', exact: true }).click()

  await page.getByLabel('city', { exact: true }).fill('Paris')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm save request' }).click()

  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(
    page,
    'test("mentions the city", function () {\n  expect(res.getText()).to.include("Paris")\n})'
  )
  await page.waitForTimeout(600)

  // Confirm it's skipped without a marked request yet.
  await openEverythingDetails(page)
  await page.getByRole('button', { name: 'Tests (1)', exact: true }).click()
  await page.getByRole('button', { name: 'Run args-prompt' }).click()
  await expect(page.getByText('Skipped — needs input')).toBeVisible({ timeout: 10_000 })

  // Go back and mark the saved request as the one automated runs should use.
  await page.getByRole('button', { name: 'args-prompt', exact: true }).click()
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  await page.getByRole('button', { name: /^Use .* for tests$/ }).click()
  await expect(
    page.getByText('Automated test runs use "Request 1" for this capability.')
  ).toBeVisible()

  // Re-running from the server Tests tab now resolves city from the marked
  // request and passes.
  await openEverythingDetails(page)
  await page.getByRole('button', { name: 'Tests (1)', exact: true }).click()
  await page.getByRole('button', { name: 'Run args-prompt' }).click()
  await expect(page.getByText('1 passed').first()).toBeVisible({ timeout: 10_000 })
})
