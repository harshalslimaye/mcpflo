import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s trigger-long-running-operation tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'trigger-long-running-operation', exact: true }).click()

  // Override the schema defaults (duration 10s, 5 steps) so the test doesn't
  // wait out the full default operation.
  await page.getByLabel('duration', { exact: true }).fill('1')
  await page.getByLabel('steps', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.locator('p', { hasText: 'Executing…' })).toBeVisible()
  await expect(
    page.getByText('Long running operation completed. Duration: 1 seconds, Steps: 2.')
  ).toBeVisible({ timeout: 15_000 })
})
