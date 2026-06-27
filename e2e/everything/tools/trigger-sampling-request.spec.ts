import { test, expect, openEverythingGroup } from '../../fixtures'

test('responds to a server sampling request from trigger-sampling-request', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'trigger-sampling-request', exact: true }).click()

  // maxTokens left at its schema default (100).
  await page.getByLabel('prompt', { exact: true }).fill('octopus facts')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  // The tool's mid-call sampling/createMessage request opens MCPFlo's sampling
  // modal — MCPFlo has no real LLM, so the user writes the assistant turn by hand.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Sampling request')).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByText(/during trigger-sampling-request/)).toBeVisible()
  await expect(dialog.getByText('You are a helpful test server.')).toBeVisible()
  await expect(
    dialog.getByText('Resource trigger-sampling-request context: octopus facts')
  ).toBeVisible()

  await dialog.getByLabel('Assistant reply', { exact: true }).fill('This is the AI response.')
  await dialog.getByRole('button', { name: 'Accept', exact: true }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('LLM sampling result:')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('"text": "This is the AI response."')).toBeVisible()
  await expect(page.getByText('"model": "mcpflo-manual"')).toBeVisible()
  await expect(page.getByText('"stopReason": "endTurn"')).toBeVisible()
})
