import { test, expect } from './fixtures'

test('launches the main window', async ({ page }) => {
  await expect(page).toHaveTitle('MCPFlo')
  await expect(page.locator('#root')).not.toBeEmpty()
})
