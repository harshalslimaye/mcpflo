import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s get-sum tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'get-sum', exact: true }).click()

  await page.getByLabel('a', { exact: true }).fill('2')
  await page.getByLabel('b', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('The sum of 2 and 3 is 5.')).toBeVisible({ timeout: 10_000 })
})
