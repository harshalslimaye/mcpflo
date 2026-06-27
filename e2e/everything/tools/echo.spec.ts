import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s echo tool', async ({ page }) => {
  test.setTimeout(60_000)

  // Expand the seeded "Everything" server — this lazy-fetches its capabilities,
  // spawning the real reference server (`npx @modelcontextprotocol/server-everything`)
  // over stdio, so the first connect can take a few seconds.
  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'echo', exact: true }).click()

  await page.getByLabel('message', { exact: true }).fill('hello e2e')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Echo: hello e2e')).toBeVisible({ timeout: 10_000 })
})
