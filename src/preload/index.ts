import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ServerConfig,
  ConnectResult,
  CachedCapabilities,
  ToolCallOutcome,
  ToolCallNotificationEvent,
  ElicitationRequestEvent,
  ElicitationClosedEvent,
  ElicitationResult
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
    },
    // Subscribes to mid-call elicitation requests; returns an unsubscribe function.
    onElicitationRequest: (callback: (event: ElicitationRequestEvent) => void): (() => void) => {
      const listener = (_: unknown, payload: ElicitationRequestEvent): void => callback(payload)
      ipcRenderer.on('mcp:elicitationRequest', listener)
      return () => {
        ipcRenderer.removeListener('mcp:elicitationRequest', listener)
      }
    },
    // Fired when a pending elicitation was settled without the user (server
    // abort, call ended) and its modal should close.
    onElicitationClosed: (callback: (event: ElicitationClosedEvent) => void): (() => void) => {
      const listener = (_: unknown, payload: ElicitationClosedEvent): void => callback(payload)
      ipcRenderer.on('mcp:elicitationClosed', listener)
      return () => {
        ipcRenderer.removeListener('mcp:elicitationClosed', listener)
      }
    },
    respondToElicitation: (elicitationId: string, result: ElicitationResult): Promise<void> =>
      ipcRenderer.invoke('mcp:respondToElicitation', elicitationId, result)
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
