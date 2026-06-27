import { test, expect, openEverythingGroup } from '../../fixtures'

test('responds to a server sampling request from trigger-sampling-request-async', async ({
  page
}) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'trigger-sampling-request-async', exact: true }).click()

  await page.getByLabel('prompt', { exact: true }).fill('octopus facts async')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  // Same sampling modal as the sync tool — the difference is invisible to the
  // user: the server polls tasks/get / tasks/result in the background instead
  // of getting a direct response, so completion takes a bit longer.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Sampling request')).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByText(/during trigger-sampling-request-async/)).toBeVisible()
  await expect(
    dialog.getByText('Resource trigger-sampling-request-async context: octopus facts async')
  ).toBeVisible()

  await dialog.getByLabel('Assistant reply', { exact: true }).fill('This is the async AI response.')
  await dialog.getByRole('button', { name: 'Accept', exact: true }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('[COMPLETED] Async sampling completed!')).toBeVisible({
    timeout: 20_000
  })
  await expect(page.getByText('"text": "This is the async AI response."')).toBeVisible()
  await expect(page.getByText('"model": "mcpflo-manual"')).toBeVisible()
  await expect(page.getByText('"stopReason": "endTurn"')).toBeVisible()
})
