import { test, expect, openEverythingGroup } from '../fixtures'

// SavedRequestRow's rename/load/delete interactions are already exhaustively
// unit-tested against a mocked testing API (ToolRequestPanel.test.tsx). What
// those tests can't reach is the real Electron IPC round trip — does a rename
// or delete actually persist to disk and read back through the real app.
// These two specs cover that gap against the real Everything server; they
// don't re-litigate the interaction logic itself.

test('renaming a saved request persists across a tab switch', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'get-sum', exact: true }).click()

  await page.getByLabel('a', { exact: true }).fill('2')
  await page.getByLabel('b', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm save request' }).click()

  await page.getByRole('button', { name: /^Saved/ }).click()
  await expect(page.getByText('Request 1')).toBeVisible()

  await page.getByRole('button', { name: 'Rename Request 1' }).click()
  await page.getByLabel('Rename saved request', { exact: true }).fill('Small numbers')
  await page.keyboard.press('Enter')

  await expect(page.getByText('Small numbers')).toBeVisible()
  await expect(page.getByText('Request 1')).not.toBeVisible()

  // Real remount, not a mocked re-render: leave the Saved tab and come back.
  await page.getByRole('button', { name: 'Params', exact: true }).click()
  await page.getByRole('button', { name: /^Saved/ }).click()
  await expect(page.getByText('Small numbers')).toBeVisible()
})

test('loading a saved request repopulates the form, and deleting it removes it', async ({
  page
}) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'get-sum', exact: true }).click()

  await page.getByLabel('a', { exact: true }).fill('7')
  await page.getByLabel('b', { exact: true }).fill('9')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm save request' }).click()

  // Overwrite the live form so Load's effect is unambiguous.
  await page.getByLabel('a', { exact: true }).fill('0')
  await page.getByLabel('b', { exact: true }).fill('0')

  await page.getByRole('button', { name: /^Saved/ }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  // Load switches back to the Params tab as part of applying the saved args.
  await expect(page.getByLabel('a', { exact: true })).toHaveValue('7')
  await expect(page.getByLabel('b', { exact: true })).toHaveValue('9')

  await page.getByRole('button', { name: /^Saved/ }).click()
  await page.getByRole('button', { name: 'Delete Request 1' }).click()

  await expect(page.getByText(/No saved requests yet/)).toBeVisible()
})
