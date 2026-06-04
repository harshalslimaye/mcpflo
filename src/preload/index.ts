import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ServerConfig, ConnectResult } from '../shared/mcp.types'

const api = {
  mcp: {
    getServers: (): Promise<ServerConfig[]> => ipcRenderer.invoke('mcp:getServers'),
    addServer: (config: ServerConfig): Promise<void> => ipcRenderer.invoke('mcp:addServer', config),
    updateServer: (id: string, patch: Partial<Omit<ServerConfig, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('mcp:updateServer', id, patch),
    removeServer: (id: string): Promise<void> => ipcRenderer.invoke('mcp:removeServer', id),
    connectServer: (config: ServerConfig): Promise<ConnectResult> =>
      ipcRenderer.invoke('mcp:connectServer', config),
    disconnectServer: (id: string): Promise<void> => ipcRenderer.invoke('mcp:disconnectServer', id)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
