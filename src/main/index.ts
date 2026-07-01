import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { registerIpcHandlers } from './ipc'
import { fixPath } from './fixPath'
import { seedDefaultServers } from './store'
import { disconnectAll } from './mcpClient'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// True if the URL is the app's own renderer (packaged file:// build or the
// electron-vite dev server), as opposed to some other origin.
function isAppOrigin(url: string): boolean {
  const isDevServer =
    is.dev && !!process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])
  const isAppFile = url.startsWith('file://') && url.includes(join('out', 'renderer', 'index.html'))
  return isDevServer || isAppFile
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Top-level navigation guard: the preload bridge (window.api) is attached
  // to whatever page is loaded in this window, so if the main frame ever
  // navigated to a remote origin (e.g. triggered by attacker-controlled MCP
  // content), that origin would inherit the privileged bridge. Only allow
  // navigation within the app's own renderer; send everything else to the
  // system browser instead, mirroring setWindowOpenHandler above.
  const denyNavigation = (event: Electron.Event, url: string): void => {
    if (isAppOrigin(url)) return
    event.preventDefault()
    shell.openExternal(url)
  }
  mainWindow.webContents.on('will-navigate', denyNavigation)
  mainWindow.webContents.on('will-redirect', denyNavigation)

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  app.setName('MCPFlo')

  // Restore the user's real PATH so stdio MCP servers (e.g. `npx ...`) resolve
  // when the app is launched from Finder/Dock rather than a terminal. Only needed
  // for packaged builds; in dev the app already inherits the terminal's PATH.
  if (!is.dev) {
    fixPath()
  }

  // First-run only: pre-populate an example MCP server so a fresh install has
  // something to explore immediately.
  seedDefaultServers()
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  registerIpcHandlers()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Closes all spawned MCP server processes before exit. `before-quit` is
// preempted once to await cleanup, then quit is re-triggered to actually exit.
let isQuitting = false
app.on('before-quit', (event) => {
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  disconnectAll().finally(() => app.quit())
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
