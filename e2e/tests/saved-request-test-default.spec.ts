import {
  test,
  expect,
  openEverythingGroup,
  openEverythingDetails,
  fillTestScript
} from '../fixtures'

test('marking a Saved Request "use for tests" un-skips a capability in the server Tests tab', async ({
  page
}) => {
  test.setTimeout(90_000)

  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'get-sum', exact: true }).click()

  // Save the args that resolveToolArgs (lib/autoArgs.ts) can't derive on its
  // own — a, b have no schema defaults — as a reusable request.
  await page.getByLabel('a', { exact: true }).fill('2')
  await page.getByLabel('b', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm save request' }).click()

  // Give it a test script before checking the skip → run transition.
  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(
    page,
    'test("has a sum", function () {\n  expect(res.getText()).to.include("5")\n})'
  )
  await page.waitForTimeout(600)

  // Confirm it's skipped without a marked request yet.
  await openEverythingDetails(page)
  await page.getByRole('button', { name: 'Tests (1)', exact: true }).click()
  await page.getByRole('button', { name: 'Run get-sum' }).click()
  await expect(page.getByText('Skipped — needs input')).toBeVisible({ timeout: 10_000 })

  // Go back and mark the saved request as the one automated runs should use.
  await page.getByRole('button', { name: 'get-sum', exact: true }).click()
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  await page.getByRole('button', { name: /^Use .* for tests$/ }).click()
  await expect(
    page.getByText('Automated test runs use "Request 1" for this capability.')
  ).toBeVisible()

  // Re-running from the server Tests tab now resolves (2, 3) from the marked
  // request and passes.
  await openEverythingDetails(page)
  await page.getByRole('button', { name: 'Tests (1)', exact: true }).click()
  await page.getByRole('button', { name: 'Run get-sum' }).click()
  await expect(page.getByText('1 passed').first()).toBeVisible({ timeout: 10_000 })
})
