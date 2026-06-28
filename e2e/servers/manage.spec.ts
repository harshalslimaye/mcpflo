import { test, expect } from '../fixtures'

test.describe('server management', () => {
  test('adds a stdio server via the manual form', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Server', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Test Stdio Server')
    await dialog.getByLabel('Command').fill('node')

    await dialog.getByRole('button', { name: 'Add Server', exact: true }).click()

    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Test Stdio Server')).toBeVisible()
  })

  test('rejects submitting without a name or command', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Server', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Add Server', exact: true }).click()

    await expect(dialog.getByText('Name is required')).toBeVisible()
    await expect(dialog.getByText('Command is required')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('deletes the seeded server', async ({ page }) => {
    const row = page.getByRole('group', { name: 'Everything' })
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'Delete server' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Delete Server')).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Everything', { exact: true })).not.toBeVisible()
  })
})
