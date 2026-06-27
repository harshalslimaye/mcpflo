import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s get-env tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'get-env', exact: true }).click()

  // No input schema fields — the request form shows this in place of a form.
  await expect(page.getByText('This tool takes no parameters.')).toBeVisible()

  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  // Output content (the full process env) is environment-dependent, so assert
  // on stable keys rather than exact values.
  await expect(page.getByText(/"PATH"/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/"HOME"/)).toBeVisible()
})
