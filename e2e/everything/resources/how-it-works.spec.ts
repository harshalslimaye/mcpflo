import { test, expect, openEverythingGroup } from '../../fixtures'

test('reads the Everything server\'s how-it-works.md resource', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resources')

  await page.getByRole('button', { name: 'how-it-works.md', exact: true }).click()
  await expect(page.getByLabel('Resource URI', { exact: true })).toHaveValue(
    'demo://resource/static/document/how-it-works.md'
  )

  await page.getByRole('button', { name: 'Read', exact: true }).click()

  await expect(page.getByText('# Everything Server - How It Works')).toBeVisible({
    timeout: 10_000
  })
})
