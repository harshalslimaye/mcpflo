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

  test('adds a streamable-http server via the manual form', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Server', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Test HTTP Server')
    await dialog.getByRole('button', { name: 'streamable-http', exact: true }).click()
    await dialog.getByLabel('URL').fill('https://mcp.example.com/mcp')

    await dialog.getByRole('button', { name: 'Add Server', exact: true }).click()

    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Test HTTP Server')).toBeVisible()
  })

  test('imports every server from a pasted multi-entry JSON config', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Server', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Paste JSON config', exact: true }).click()
    await dialog.getByLabel('JSON config').fill(
      JSON.stringify({
        mcpServers: {
          'Imported Server A': { command: 'node' },
          'Imported Server B': { command: 'node' }
        }
      })
    )

    await dialog.getByRole('button', { name: 'Add Server', exact: true }).click()

    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Imported Server A')).toBeVisible()
    await expect(page.getByText('Imported Server B')).toBeVisible()
  })

  test('shows an inline error for invalid pasted JSON and adds nothing', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Server', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Paste JSON config', exact: true }).click()
    await dialog.getByLabel('JSON config').fill('{ this is not valid json')

    await dialog.getByRole('button', { name: 'Add Server', exact: true }).click()

    await expect(dialog.getByText('Invalid JSON')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('Cancel closes the dialog without adding a server', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Server', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Should Not Be Added')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Should Not Be Added')).not.toBeVisible()
  })
})
