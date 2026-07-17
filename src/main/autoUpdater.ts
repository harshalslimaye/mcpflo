import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { disconnectAll } from './mcpClient'
import type { UpdateStatus } from '../shared/updater.types'

let status: UpdateStatus = { state: 'idle', currentVersion: app.getVersion() }
let installingUpdate = false

export function getUpdateStatus(): UpdateStatus {
  return status
}

// Read by index.ts's before-quit guard: once true, MCP cleanup already ran
// here (installUpdateNow), so the guard must let electron-updater's own quit
// proceed untouched rather than intercepting it.
export function isInstallingUpdate(): boolean {
  return installingUpdate
}

function setStatus(patch: Partial<UpdateStatus>): void {
  status = { ...status, ...patch }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send('updater:event', status)
  }
}

// Unpackaged runs (dev, and Playwright e2e which launches out/main/index.js
// directly) never hit the network. MCPFLO_TEST_UPDATES=1 is a manual escape
// hatch for local smoke testing against dev-app-update.yml.
function updaterEnabled(): boolean {
  if (app.isPackaged) return true
  if (process.env.MCPFLO_TEST_UPDATES === '1') {
    autoUpdater.forceDevUpdateConfig = true
    return true
  }
  return false
}

export function initAutoUpdater(): void {
  if (!updaterEnabled()) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking', message: undefined }))
  autoUpdater.on('update-available', (info) =>
    setStatus({ state: 'downloading', availableVersion: info.version, percent: 0 })
  )
  autoUpdater.on('update-not-available', () => setStatus({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    setStatus({ state: 'downloading', percent: progress.percent })
  )
  autoUpdater.on('update-downloaded', (info) =>
    setStatus({ state: 'downloaded', availableVersion: info.version, percent: 100 })
  )
  // Must never crash or surface a dialog — this is the expected path on macOS
  // until Developer ID signing/notarization is wired up (signature
  // validation failure lands here too).
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err)
    setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  })

  void autoUpdater.checkForUpdates().catch(() => {})
}

export async function checkForUpdatesNow(): Promise<UpdateStatus> {
  if (updaterEnabled()) {
    await autoUpdater.checkForUpdates().catch(() => {})
  }
  return status
}

export async function installUpdateNow(): Promise<void> {
  if (status.state !== 'downloaded' || installingUpdate) return
  installingUpdate = true
  try {
    await disconnectAll()
  } catch {
    // best-effort — never block an update install on MCP teardown
  }
  autoUpdater.quitAndInstall()
}
