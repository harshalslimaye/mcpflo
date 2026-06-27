import { test, expect, openEverythingGroup } from '../../fixtures'

test('reads the Everything server\'s architecture.md resource', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resources')

  // Resources have no input form — just a fixed URI and a Read action.
  await page.getByRole('button', { name: 'architecture.md', exact: true }).click()
  await expect(page.getByLabel('Resource URI', { exact: true })).toHaveValue(
    'demo://resource/static/document/architecture.md'
  )

  await page.getByRole('button', { name: 'Read', exact: true }).click()

  await expect(page.getByText('# Everything Server – Architecture')).toBeVisible({
    timeout: 10_000
  })
})
