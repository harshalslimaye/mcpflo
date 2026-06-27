import { test, expect, openEverythingGroup } from '../../fixtures'

test('gets the Everything server\'s completable-prompt', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Prompts')

  await page.getByRole('button', { name: 'completable-prompt', exact: true }).click()

  await page.getByLabel('department', { exact: true }).fill('Engineering')
  await page.getByLabel('name', { exact: true }).fill('Alice')
  await page.getByRole('button', { name: 'Get Prompt', exact: true }).click()

  await expect(
    page.getByText('Please promote Alice to the head of the Engineering team.')
  ).toBeVisible({ timeout: 10_000 })
})
