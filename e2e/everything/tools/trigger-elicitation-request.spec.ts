import { test, expect, openEverythingGroup } from '../../fixtures'

test('accepts a server elicitation request from trigger-elicitation-request', async ({
  page
}) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'trigger-elicitation-request', exact: true }).click()
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  // The tool's own input schema is empty — it raises a mid-call elicitation
  // request with a richer schema (12 fields, including arrays/oneOf that
  // MCPFlo's form builder treats as non-primitive), which falls back to the
  // raw-JSON textarea rather than per-field inputs.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Server request')).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByText('Please provide inputs for the following fields:')).toBeVisible()
  await expect(dialog.getByText(/during trigger-elicitation-request/)).toBeVisible()

  await dialog.getByLabel('Response JSON', { exact: true }).fill('{"name": "Test User"}')
  await dialog.getByRole('button', { name: 'Accept', exact: true }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('✅ User provided the requested information!')).toBeVisible({
    timeout: 10_000
  })
  await expect(page.getByText('- Name: Test User')).toBeVisible()
})
