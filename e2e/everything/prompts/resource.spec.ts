import { test, expect, openEverythingGroup } from '../../fixtures'

test('gets the Everything server\'s resource-prompt', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Prompts')

  await page.getByRole('button', { name: 'resource-prompt', exact: true }).click()

  // Must match the server's RESOURCE_TYPES exactly ("Text" / "Blob").
  await page.getByLabel('resourceType', { exact: true }).fill('Text')
  await page.getByLabel('resourceId', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Get Prompt', exact: true }).click()

  // The embedded resource's own text includes a wall-clock timestamp, so assert
  // on the deterministic intro message and the resource's identity instead.
  await expect(
    page.getByText('This prompt includes the Text resource with id: 1. Please analyze the following resource:')
  ).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('demo://resource/dynamic/text/1')).toBeVisible()
  await expect(page.getByText('text/plain')).toBeVisible()
})
