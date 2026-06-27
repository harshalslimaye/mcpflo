import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s get-structured-content tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'get-structured-content', exact: true }).click()

  await page.getByLabel('location', { exact: true }).selectOption('New York')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  // The text content block and the dedicated "structured output" card both
  // render the same payload — scope assertions to the structured output card
  // specifically, since its values are deterministic per location.
  const structuredCard = page.getByText('structured output', { exact: true }).locator('xpath=..')
  await expect(structuredCard.getByText(/"temperature":\s*33/)).toBeVisible({ timeout: 10_000 })
  await expect(structuredCard.getByText(/"conditions":\s*"Cloudy"/)).toBeVisible()
  await expect(structuredCard.getByText(/"humidity":\s*82/)).toBeVisible()
})
