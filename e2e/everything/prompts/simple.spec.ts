import { test, expect, openEverythingGroup } from '../../fixtures'

test('gets the Everything server\'s simple-prompt', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Prompts')

  await page.getByRole('button', { name: 'simple-prompt', exact: true }).click()

  await expect(page.getByText('This prompt takes no arguments.')).toBeVisible()
  await page.getByRole('button', { name: 'Get Prompt', exact: true }).click()

  await expect(page.getByText('This is a simple prompt without arguments.')).toBeVisible({
    timeout: 10_000
  })
})
