import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { test, expect, openEverythingDetails, fillTestScript } from '../fixtures'

// dialog.showOpenDialog is a native OS picker Playwright can't drive directly —
// stub it on the main-process `dialog` module to resolve with a given path, as
// if the user had picked it.
async function stubFolderPicker(
  electronApp: import('@playwright/test').ElectronApplication,
  dir: string
): Promise<void> {
  await electronApp.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [picked]
    })) as typeof dialog.showOpenDialog
  }, dir)
}

test('pointing a server at a custom tests folder moves script storage there', async ({
  page,
  electronApp
}) => {
  test.setTimeout(60_000)

  const customDir = mkdtempSync(join(tmpdir(), 'mcpflo-e2e-tests-folder-'))
  try {
    await stubFolderPicker(electronApp, customDir)

    // openEverythingDetails does the row's one-time expand and lands on the
    // Overview tab, where the Tests Folder card lives.
    await openEverythingDetails(page)
    await page.getByRole('button', { name: 'Tests Folder' }).click()
    await expect(page.getByText('Loading…')).not.toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Choose folder…' }).click()
    await expect(page.getByText(customDir)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Use default' })).toBeVisible()

    // Drill into the sidebar's Tools list once — it stays populated across
    // later navigation between the tool and the server's own tabs, same as
    // every other spec in this suite. `.first()`, not just `/^Tools/` — the
    // Overview tab we're already on has its own "Tools 17" summary tile and
    // Context Budget row matching that regex too; the sidebar's own category
    // button is the first "Tools…" match because SecondarySidebar mounts
    // before ContentArea (App.tsx).
    const toolsGroup = page.getByRole('button', { name: /^Tools/ }).first()
    await expect(toolsGroup).toBeEnabled({ timeout: 30_000 })
    await toolsGroup.click()
    await page.getByRole('button', { name: 'echo', exact: true }).click()
    await page
      .getByRole('button', { name: /^Tests/ })
      .first()
      .click()
    await fillTestScript(
      page,
      'test("is not an error", function () {\n  expect(res.getIsError()).to.equal(false)\n})'
    )
    await page.waitForTimeout(600)

    // Detour through another tool and back to prove the script round-trips
    // through the custom folder rather than a stale default-folder read.
    await page.getByRole('button', { name: 'get-sum', exact: true }).click()
    await page.getByRole('button', { name: 'echo', exact: true }).click()
    await page
      .getByRole('button', { name: /^Tests/ })
      .first()
      .click()
    await expect(page.locator('.cm-content')).toContainText('is not an error')

    // Revert to the default folder — a different root, so it must not carry
    // the custom folder's script along.
    await openEverythingDetails(page)
    await page.getByRole('button', { name: 'Tests Folder' }).click()
    await page.getByRole('button', { name: 'Use default' }).click()
    await expect(page.getByRole('button', { name: 'Use default' })).not.toBeVisible()

    // CodeMirror renders its placeholder as a decoration inside `.cm-content`
    // itself once the doc is empty (not a native `placeholder` attribute), so
    // its presence — rather than `.cm-content`'s raw text — is what actually
    // proves the document is empty (see script-delete.spec.ts).
    await page.getByRole('button', { name: 'echo', exact: true }).click()
    await page
      .getByRole('button', { name: /^Tests/ })
      .first()
      .click()
    await expect(page.locator('.cm-placeholder')).toBeVisible()
  } finally {
    rmSync(customDir, { recursive: true, force: true })
  }
})

test('a missing custom tests folder shows a warning instead of silently recreating it', async ({
  page,
  electronApp
}) => {
  test.setTimeout(60_000)

  // A path that never existed on disk — same effect as the user deleting or
  // moving a folder they'd previously picked.
  const goneDir = mkdtempSync(join(tmpdir(), 'mcpflo-e2e-tests-folder-gone-'))
  rmSync(goneDir, { recursive: true, force: true })
  await stubFolderPicker(electronApp, goneDir)

  await openEverythingDetails(page)
  await page.getByRole('button', { name: 'Tests Folder' }).click()
  await page.getByRole('button', { name: 'Choose folder…' }).click()

  await expect(page.getByText('Folder not found')).toBeVisible({ timeout: 10_000 })
})
