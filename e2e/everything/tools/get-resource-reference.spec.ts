import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s get-resource-reference tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'get-resource-reference', exact: true }).click()

  // resourceType defaults to "Text", resourceId defaults to 1 — run as-is.
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  // The resource's own text includes a wall-clock timestamp, so assert on the
  // surrounding deterministic content instead of the full resource body.
  await expect(page.getByText('Returning resource reference for Resource 1:')).toBeVisible({
    timeout: 10_000
  })
  await expect(
    page.getByText('You can access this resource using the URI: demo://resource/dynamic/text/1')
  ).toBeVisible()
})
