import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s get-resource-links tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'get-resource-links', exact: true }).click()

  // `count` defaults to 3 — run with the schema default, no input needed.
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(
    page.getByText('Here are 3 resource links to resources available in this server:')
  ).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Blob Resource 1')).toBeVisible()
  await expect(page.getByText('Text Resource 2')).toBeVisible()
  await expect(page.getByText('Blob Resource 3')).toBeVisible()
  await expect(page.getByText('demo://resource/dynamic/blob/1')).toBeVisible()
})
