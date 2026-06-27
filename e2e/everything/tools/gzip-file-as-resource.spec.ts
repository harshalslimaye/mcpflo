import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s gzip-file-as-resource tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'gzip-file-as-resource', exact: true }).click()

  // Defaults: name "README.md.gz", a remote README URL, outputType "resourceLink".
  // The tool fetches that URL over the network to compress it.
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('README.md.gz', { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('demo://resource/session/README.md.gz')).toBeVisible()
  await expect(page.getByText('application/gzip')).toBeVisible()
})
