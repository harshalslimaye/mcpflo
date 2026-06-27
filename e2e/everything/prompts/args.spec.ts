import { test, expect, openEverythingGroup } from '../../fixtures'

test('gets the Everything server\'s args-prompt', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Prompts')

  await page.getByRole('button', { name: 'args-prompt', exact: true }).click()

  // `city` is required, `state` is optional — leave state blank.
  await page.getByLabel('city', { exact: true }).fill('Paris')
  await page.getByRole('button', { name: 'Get Prompt', exact: true }).click()

  await expect(page.getByText("What's weather in Paris?")).toBeVisible({ timeout: 10_000 })
})
