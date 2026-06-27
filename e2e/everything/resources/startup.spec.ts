import { test, expect, openEverythingGroup } from '../../fixtures'

test('reads the Everything server\'s startup.md resource', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resources')

  await page.getByRole('button', { name: 'startup.md', exact: true }).click()
  await expect(page.getByLabel('Resource URI', { exact: true })).toHaveValue(
    'demo://resource/static/document/startup.md'
  )

  await page.getByRole('button', { name: 'Read', exact: true }).click()

  await expect(page.getByText('# Everything Server - Startup Process')).toBeVisible({
    timeout: 10_000
  })
})
