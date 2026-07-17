import { test, expect } from '../fixtures'

// themeStore/BottomBar are exhaustively unit-tested against a mocked
// localStorage — toggling flips state and writes the key, applyTheme sets the
// data-theme attribute. What jsdom can't exercise is a real page reload: does
// the persisted value actually survive and get re-read into the running app
// on the next load, in the same Electron profile.

test('toggling the theme persists across a page reload', async ({ page }) => {
  test.setTimeout(60_000)

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: 'Toggle Theme', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
