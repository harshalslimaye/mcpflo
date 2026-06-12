import { ipcMain } from 'electron'
import { getServers, addServer, updateServer, removeServer } from './store'
import { fetchCapabilities, callTool } from './mcpClient'
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

  // Tool execution. Notifications arriving mid-call are pushed to the calling
  // window over `mcp:toolNotification`, tagged with the renderer-chosen callId.
  ipcMain.handle(
    'mcp:callTool',
    (
      event,
      config: ServerConfig,
      toolName: string,
      args: Record<string, unknown>,
      callId?: string
    ) =>
      callTool(config, toolName, args, (notification) => {
        if (callId !== undefined && !event.sender.isDestroyed()) {
          event.sender.send('mcp:toolNotification', { callId, notification })
        }
      })
  )
}
