import { test, expect, openEverythingGroup } from '../../fixtures'

test('accepts a server elicitation request from trigger-elicitation-request-async', async ({
  page
}) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page
    .getByRole('button', { name: 'trigger-elicitation-request-async', exact: true })
    .click()
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  // Unlike the sync tool's schema, this one has no array fields, so MCPFlo
  // renders it as a real per-field form rather than falling back to raw JSON.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Server request')).toBeVisible({ timeout: 10_000 })
  await expect(
    dialog.getByText('Please provide inputs for the following fields (async task demo):')
  ).toBeVisible()
  await expect(dialog.getByText(/during trigger-elicitation-request-async/)).toBeVisible()

  await dialog.getByLabel('name', { exact: true }).fill('Test User Async')
  await dialog.getByRole('button', { name: 'Accept', exact: true }).click()

  await expect(dialog).not.toBeVisible()
  // Polled via tasks/get in the background, so completion takes a bit longer
  // than the synchronous elicitation tool.
  await expect(
    page.getByText('[COMPLETED] User provided the requested information!')
  ).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('- Name: Test User Async')).toBeVisible()
})
