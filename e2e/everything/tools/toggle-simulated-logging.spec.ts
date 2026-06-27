import { test, expect, openEverythingGroup } from '../../fixtures'

test('toggles the Everything server\'s simulated logging on and off', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'toggle-simulated-logging', exact: true }).click()
  await expect(page.getByText('This tool takes no parameters.')).toBeVisible()

  const execute = page.getByRole('button', { name: 'Execute', exact: true })

  await execute.click()
  await expect(
    page.getByText(/Started simulated, random-leveled logging for session/)
  ).toBeVisible({ timeout: 10_000 })

  // Toggle it back off so no background interval is left running on the server.
  await execute.click()
  await expect(page.getByText(/Stopped simulated logging for session/)).toBeVisible({
    timeout: 10_000
  })
})
