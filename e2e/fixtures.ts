import {
  test as base,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js')

export const test = base.extend<{ electronApp: ElectronApplication; page: Page }>({
  electronApp: async ({}, use) => {
    // Isolated profile per test, so persisted server config never leaks between
    // tests or into the developer's real MCPFlo data. Electron's built-in
    // --user-data-dir switch overrides app.getPath('userData') before app ready.
    const userDataDir = mkdtempSync(join(tmpdir(), 'mcpflo-e2e-'))
    const app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`]
    })
    await use(app)
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect } from '@playwright/test'

// Every spec under everything/ targets the seeded "Everything" reference
// server, then drills into one capability group (Tools / Resources / Prompts).
// This collapses that shared setup, including the wait for the group to
// populate (it starts disabled until the lazy-fetched capabilities arrive).
export async function openEverythingGroup(
  page: Page,
  group: 'Tools' | 'Resources' | 'Prompts'
): Promise<void> {
  await page.locator('button', { hasText: 'Everything' }).click()
  const groupButton = page.getByRole('button', { name: new RegExp(`^${group}`) })
  await expect(groupButton).toBeEnabled({ timeout: 30_000 })
  await groupButton.click()
}
