import { test, expect, openEverythingGroup } from '../../fixtures'

test('reads the Everything server\'s structure.md resource', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resources')

  await page.getByRole('button', { name: 'structure.md', exact: true }).click()
  await expect(page.getByLabel('Resource URI', { exact: true })).toHaveValue(
    'demo://resource/static/document/structure.md'
  )

  await page.getByRole('button', { name: 'Read', exact: true }).click()

  await expect(page.getByText('# Everything Server - Project Structure')).toBeVisible({
    timeout: 10_000
  })
})
