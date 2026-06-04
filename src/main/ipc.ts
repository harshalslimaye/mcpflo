import { ipcMain } from 'electron'
import { getServers, addServer, updateServer, removeServer } from './store'
import { connectServer, disconnectServer } from './mcpClient'
import type { ServerConfig } from '../shared/mcp.types'

export function registerIpcHandlers(): void {
  ipcMain.handle('mcp:getServers', () => getServers())

  ipcMain.handle('mcp:addServer', (_event, config: ServerConfig) => addServer(config))

  ipcMain.handle(
    'mcp:updateServer',
    (_event, id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => updateServer(id, patch)
  )

  ipcMain.handle('mcp:removeServer', (_event, id: string) => removeServer(id))

  ipcMain.handle('mcp:connectServer', (_event, config: ServerConfig) => connectServer(config))

  ipcMain.handle('mcp:disconnectServer', (_event, id: string) => disconnectServer(id))
}
