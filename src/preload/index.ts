import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ServerConfig,
  ConnectResult,
  CachedCapabilities,
  ToolCallOutcome,
  ToolCallNotificationEvent
} from '../shared/mcp.types'

const api = {
  mcp: {
    getServers: (): Promise<ServerConfig[]> => ipcRenderer.invoke('mcp:getServers'),
    addServer: (config: ServerConfig): Promise<void> => ipcRenderer.invoke('mcp:addServer', config),
    updateServer: (id: string, patch: Partial<Omit<ServerConfig, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('mcp:updateServer', id, patch),
    removeServer: (id: string): Promise<void> => ipcRenderer.invoke('mcp:removeServer', id),
    getCachedCapabilities: (): Promise<Record<string, CachedCapabilities>> =>
      ipcRenderer.invoke('mcp:getCachedCapabilities'),
    fetchCapabilities: (config: ServerConfig): Promise<ConnectResult> =>
      ipcRenderer.invoke('mcp:fetchCapabilities', config),
    clearCapabilities: (id: string): Promise<void> =>
      ipcRenderer.invoke('mcp:clearCapabilities', id),
    callTool: (
      config: ServerConfig,
      toolName: string,
      args: Record<string, unknown>,
      callId?: string
    ): Promise<ToolCallOutcome> =>
      ipcRenderer.invoke('mcp:callTool', config, toolName, args, callId),
    // Subscribes to mid-call notifications; returns an unsubscribe function.
    onToolNotification: (callback: (event: ToolCallNotificationEvent) => void): (() => void) => {
      const listener = (_: unknown, payload: ToolCallNotificationEvent): void => callback(payload)
      ipcRenderer.on('mcp:toolNotification', listener)
      return () => {
        ipcRenderer.removeListener('mcp:toolNotification', listener)
      }
    }
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
