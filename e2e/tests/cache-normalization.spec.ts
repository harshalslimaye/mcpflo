import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const MAIN_ENTRY = resolve(__dirname, '../../out/main/index.js')

// The only check that proves normalizeCapabilities is actually wired into the
// path hydrate reads, rather than merely written: a unit test can call it
// directly and pass while nothing calls it for real, and typecheck can't see a
// cache file at all. So this drives the real app twice over one profile,
// editing the on-disk cache in between the way a crash, a downgrade, or a hand
// edit would leave it.
//
// Unlike every other spec here it manages its own user-data dir, because the
// whole point is that the second launch reads what the first one wrote.
async function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({ args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`] })
}

// The seeded Everything server's cache file, once it has been fetched at least
// once. Server ids are random UUIDs, so it's found by listing rather than named.
function capabilitiesFile(userDataDir: string): string {
  const serversDir = join(userDataDir, 'servers')
  const [serverId] = readdirSync(serversDir)
  return join(serversDir, serverId, 'capabilities.json')
}

test('loads servers from a cache file whose fields hold the wrong types', async () => {
  test.setTimeout(120_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'mcpflo-cache-e2e-'))

  try {
    // First run: fetch the Everything server so its capabilities land on disk.
    const first = await launch(userDataDir)
    const firstPage = await first.firstWindow()
    await firstPage.waitForLoadState('domcontentloaded')
    const row = firstPage.getByRole('group', { name: 'Everything' })
    await row.getByRole('button', { name: /Expand|Collapse/ }).click()
    await expect(firstPage.getByRole('button', { name: /^Resource Templates/ })).toBeEnabled({
      timeout: 30_000
    })
    await first.close()

    // Corrupt the file the way a half-written or hand-edited one would be.
    //
    // A *missing* key wouldn't prove anything: toRuntime's `cached?.x ?? []`
    // already covers absent and null. What it can't cover is a key present
    // with the wrong type — `?? []` passes a string straight through, and the
    // sidebar then calls .filter() on it. That is the case only normalization
    // catches, so it's the one worth driving the whole app for.
    const file = capabilitiesFile(userDataDir)
    const cached = JSON.parse(readFileSync(file, 'utf-8'))
    expect(Array.isArray(cached.resourceTemplates)).toBe(true)
    cached.resourceTemplates = 'not an array'
    cached.tools = null
    delete cached.fetchedAt
    writeFileSync(file, JSON.stringify(cached, null, 2), 'utf-8')

    // Second run: hydrate reads that file. The failure this guards against is a
    // blank sidebar — the user's servers appearing to be gone.
    const second = await launch(userDataDir)
    const secondPage = await second.firstWindow()
    await secondPage.waitForLoadState('domcontentloaded')
    try {
      await expect(secondPage.getByRole('group', { name: 'Everything' })).toBeVisible({
        timeout: 30_000
      })

      // Both corrupt fields normalize to empty lists, so the tree still opens
      // and each group reads zero rather than throwing on a string or a null.
      const restored = secondPage.getByRole('group', { name: 'Everything' })
      await restored.getByRole('button', { name: /Expand|Collapse/ }).click()

      const templates = secondPage.getByRole('button', { name: /^Resource Templates/ })
      await expect(templates).toHaveText(/Resource Templates\s*0/)
      await expect(templates).toBeDisabled()
      await expect(secondPage.getByRole('button', { name: /^Tools/ })).toHaveText(/Tools\s*0/)
    } finally {
      await second.close()
    }
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
