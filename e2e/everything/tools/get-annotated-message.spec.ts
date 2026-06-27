import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s get-annotated-message tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'get-annotated-message', exact: true }).click()

  await page.getByLabel('messageType', { exact: true }).selectOption('error')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Error: Operation failed')).toBeVisible({ timeout: 10_000 })
})
