import { ipcMain } from 'electron'
import { getServers, addServer, updateServer, removeServer } from './store'
import { fetchCapabilities } from './mcpClient'
import {
  readAllCapabilities,
  writeCapabilities,
  clearCapabilities,
  removeServerDir
} from './capabilitiesCache'
import type { ServerConfig } from '../shared/mcp.types'

export function registerIpcHandlers(): void {
  ipcMain.handle('mcp:getServers', () => getServers())

  ipcMain.handle('mcp:addServer', (_event, config: ServerConfig) => addServer(config))

  ipcMain.handle(
    'mcp:updateServer',
    (_event, id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => updateServer(id, patch)
  )

  ipcMain.handle('mcp:removeServer', async (_event, id: string) => {
    removeServer(id)
    await removeServerDir(id)
  })

  // Capabilities cache
  ipcMain.handle('mcp:getCachedCapabilities', () => readAllCapabilities())

  ipcMain.handle('mcp:fetchCapabilities', async (_event, config: ServerConfig) => {
    const result = await fetchCapabilities(config)
    await writeCapabilities(config.id, result)
    return result
  })

  ipcMain.handle('mcp:clearCapabilities', (_event, id: string) => clearCapabilities(id))
}
