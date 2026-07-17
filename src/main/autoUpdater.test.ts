import { describe, it, expect, beforeEach, vi } from 'vitest'

interface FakeWindow {
  webContents: { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> }
}

const h = vi.hoisted(() => {
  const listeners = new Map<string, (payload?: unknown) => void>()
  return {
    appIsPackaged: false,
    windows: [] as FakeWindow[],
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    listeners,
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      logger: null as unknown,
      forceDevUpdateConfig: false,
      on: vi.fn((event: string, cb: (payload?: unknown) => void) => {
        listeners.set(event, cb)
      }),
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      quitAndInstall: vi.fn()
    }
  }
})

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.2.0',
    get isPackaged() {
      return h.appIsPackaged
    }
  },
  BrowserWindow: {
    getAllWindows: () => h.windows
  }
}))

vi.mock('electron-updater', () => ({ autoUpdater: h.autoUpdater }))

vi.mock('./mcpClient', () => ({ disconnectAll: h.disconnectAll }))

function emit(event: string, payload?: unknown): void {
  h.listeners.get(event)?.(payload)
}

describe('autoUpdater', () => {
  let mod: typeof import('./autoUpdater')

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    h.listeners.clear()
    h.appIsPackaged = false
    h.windows = []
    h.autoUpdater.autoDownload = false
    h.autoUpdater.autoInstallOnAppQuit = false
    h.autoUpdater.forceDevUpdateConfig = false
    h.disconnectAll.mockResolvedValue(undefined)
    h.autoUpdater.checkForUpdates.mockResolvedValue(undefined)
    delete process.env.MCPFLO_TEST_UPDATES
    mod = await import('./autoUpdater')
  })

  describe('initAutoUpdater', () => {
    it('does nothing when unpackaged and the test flag is unset', () => {
      mod.initAutoUpdater()
      expect(h.autoUpdater.on).not.toHaveBeenCalled()
      expect(h.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    })

    it('wires all events and checks for updates when packaged', () => {
      h.appIsPackaged = true
      mod.initAutoUpdater()
      expect(h.autoUpdater.autoDownload).toBe(true)
      expect(h.autoUpdater.autoInstallOnAppQuit).toBe(true)
      expect(h.listeners.size).toBe(6)
      expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
    })

    it('enables via MCPFLO_TEST_UPDATES=1 when unpackaged, forcing the dev update config', () => {
      process.env.MCPFLO_TEST_UPDATES = '1'
      mod.initAutoUpdater()
      expect(h.autoUpdater.forceDevUpdateConfig).toBe(true)
      expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
    })

    it('drives status through checking -> downloading -> downloaded and broadcasts to windows', () => {
      h.appIsPackaged = true
      const win: FakeWindow = { webContents: { isDestroyed: () => false, send: vi.fn() } }
      h.windows.push(win)
      mod.initAutoUpdater()

      emit('checking-for-update')
      expect(mod.getUpdateStatus().state).toBe('checking')

      emit('update-available', { version: '0.3.0' })
      expect(mod.getUpdateStatus()).toMatchObject({
        state: 'downloading',
        availableVersion: '0.3.0',
        percent: 0
      })

      emit('download-progress', { percent: 42 })
      expect(mod.getUpdateStatus()).toMatchObject({ state: 'downloading', percent: 42 })

      emit('update-downloaded', { version: '0.3.0' })
      expect(mod.getUpdateStatus()).toMatchObject({
        state: 'downloaded',
        availableVersion: '0.3.0',
        percent: 100
      })

      expect(win.webContents.send).toHaveBeenCalledWith('updater:event', mod.getUpdateStatus())
    })

    it('sets not-available state', () => {
      h.appIsPackaged = true
      mod.initAutoUpdater()
      emit('update-not-available')
      expect(mod.getUpdateStatus().state).toBe('not-available')
    })

    it('records an error without throwing, and never targets destroyed windows', () => {
      h.appIsPackaged = true
      const destroyed: FakeWindow = { webContents: { isDestroyed: () => true, send: vi.fn() } }
      h.windows.push(destroyed)
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mod.initAutoUpdater()

      expect(() => emit('error', new Error('signature verification failed'))).not.toThrow()
      expect(mod.getUpdateStatus()).toMatchObject({
        state: 'error',
        message: 'signature verification failed'
      })
      expect(destroyed.webContents.send).not.toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  describe('checkForUpdatesNow', () => {
    it('triggers a check and returns the current status when enabled', async () => {
      h.appIsPackaged = true
      const result = await mod.checkForUpdatesNow()
      expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
      expect(result).toEqual(mod.getUpdateStatus())
    })

    it('skips the network call but still returns status when disabled', async () => {
      const result = await mod.checkForUpdatesNow()
      expect(h.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
      expect(result.state).toBe('idle')
    })

    it('swallows a rejected checkForUpdates instead of throwing', async () => {
      h.appIsPackaged = true
      h.autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('network down'))
      await expect(mod.checkForUpdatesNow()).resolves.toBeDefined()
    })
  })

  describe('installUpdateNow', () => {
    it('does nothing when no update has been downloaded', async () => {
      await mod.installUpdateNow()
      expect(h.disconnectAll).not.toHaveBeenCalled()
      expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
      expect(mod.isInstallingUpdate()).toBe(false)
    })

    it('disconnects MCP sessions before quitting once an update is downloaded', async () => {
      h.appIsPackaged = true
      mod.initAutoUpdater()
      emit('update-downloaded', { version: '0.3.0' })

      await mod.installUpdateNow()

      expect(h.disconnectAll).toHaveBeenCalledOnce()
      expect(h.autoUpdater.quitAndInstall).toHaveBeenCalledOnce()
      expect(mod.isInstallingUpdate()).toBe(true)
    })

    it('still installs when disconnectAll rejects (best-effort cleanup)', async () => {
      h.appIsPackaged = true
      h.disconnectAll.mockRejectedValueOnce(new Error('teardown failed'))
      mod.initAutoUpdater()
      emit('update-downloaded', { version: '0.3.0' })

      await mod.installUpdateNow()

      expect(h.autoUpdater.quitAndInstall).toHaveBeenCalledOnce()
    })

    it('is a no-op on a second call once already installing', async () => {
      h.appIsPackaged = true
      mod.initAutoUpdater()
      emit('update-downloaded', { version: '0.3.0' })

      await mod.installUpdateNow()
      await mod.installUpdateNow()

      expect(h.disconnectAll).toHaveBeenCalledOnce()
      expect(h.autoUpdater.quitAndInstall).toHaveBeenCalledOnce()
    })
  })
})
