import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s get-tiny-image tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'get-tiny-image', exact: true }).click()

  await expect(page.getByText('This tool takes no parameters.')).toBeVisible()

  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText("Here's the image you requested:")).toBeVisible({ timeout: 10_000 })
  await expect(page.getByAltText('Tool result image')).toBeVisible()
  await expect(page.getByText('The image above is the MCP logo.')).toBeVisible()
})
