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
//
// The server row's chevron (expand/collapse) and name (select, opens the
// server details view) are separate buttons — clicking the row by name alone
// no longer expands it, so this scopes to the row's group and clicks its
// chevron specifically.
export async function openEverythingGroup(
  page: Page,
  group: 'Tools' | 'Resources' | 'Resource Templates' | 'Prompts'
): Promise<void> {
  const row = page.getByRole('group', { name: 'Everything' })
  await row.getByRole('button', { name: /Expand|Collapse/ }).click()
  const groupButton = page.getByRole('button', { name: new RegExp(`^${group}`) })
  await expect(groupButton).toBeEnabled({ timeout: 30_000 })
  await groupButton.click()
}

// Opens the seeded "Everything" server's own detail view (Overview /
// Capabilities / Tests tabs), as opposed to openEverythingGroup's sidebar
// drill-down into an individual tool/resource/prompt. Expanding the row
// (same lazy-fetch as openEverythingGroup) populates server.tools/resources/
// prompts, which the Tests tab reads directly — selecting the row alone
// never fetches (see SecondarySidebar's selectServerRow comment), so the
// expand step is required even though this helper doesn't drill into the
// tree past it. Only expands if not already expanded (e.g. a prior
// openEverythingGroup call in the same test) — the chevron toggles, so
// clicking it unconditionally would collapse an already-expanded row instead.
export async function openEverythingDetails(page: Page): Promise<void> {
  const row = page.getByRole('group', { name: 'Everything' })
  const expandButton = row.getByRole('button', { name: 'Expand' })
  if (await expandButton.isVisible()) {
    await expandButton.click()
    await expect(page.getByRole('button', { name: /^Tools/ })).toBeEnabled({ timeout: 30_000 })
  }
  await row.getByRole('button', { name: 'Everything', exact: true }).click()
}

// Types a test script into the Tests tab's CodeMirror editor. Uses
// `insertText` rather than `type`: CodeMirror's closeBrackets extension
// auto-inserts a matching `)`/`}`/quote on every keypress, so typing a script
// that already includes its own closing characters key-by-key double-inserts
// them (confirmed by hand: `type()` produced a mangled, unbalanced script).
// `insertText` delivers the whole string as one input event, which
// closeBrackets' single-character heuristic doesn't intercept.
export async function fillTestScript(page: Page, script: string): Promise<void> {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.insertText(script)
}
