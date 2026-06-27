import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ServerConfig,
  LoadedServer,
  TaskSupport,
  ConnectResult,
  CachedCapabilities,
  ToolCallOutcome,
  ResourceReadOutcome,
  PromptGetOutcome,
  ToolCallNotificationEvent,
  ElicitationRequestEvent,
  ElicitationClosedEvent,
  ElicitationResult,
  SamplingRequestEvent,
  SamplingClosedEvent,
  SamplingResult,
  AuthEvent
} from '../shared/mcp.types'

const api = {
  mcp: {
    getServers: (): Promise<LoadedServer[]> => ipcRenderer.invoke('mcp:getServers'),
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
    disconnectServer: (id: string): Promise<void> => ipcRenderer.invoke('mcp:disconnectServer', id),
    callTool: (
      config: ServerConfig,
      toolName: string,
      args: Record<string, unknown>,
      callId?: string,
      taskSupport?: TaskSupport
    ): Promise<ToolCallOutcome> =>
      ipcRenderer.invoke('mcp:callTool', config, toolName, args, callId, taskSupport),
    readResource: (config: ServerConfig, uri: string): Promise<ResourceReadOutcome> =>
      ipcRenderer.invoke('mcp:readResource', config, uri),
    getPrompt: (
      config: ServerConfig,
      name: string,
      args: Record<string, string>
    ): Promise<PromptGetOutcome> => ipcRenderer.invoke('mcp:getPrompt', config, name, args),
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
      ipcRenderer.invoke('mcp:respondToElicitation', elicitationId, result),
    // Subscribes to mid-call sampling requests; returns an unsubscribe function.
    onSamplingRequest: (callback: (event: SamplingRequestEvent) => void): (() => void) => {
      const listener = (_: unknown, payload: SamplingRequestEvent): void => callback(payload)
      ipcRenderer.on('mcp:samplingRequest', listener)
      return () => {
        ipcRenderer.removeListener('mcp:samplingRequest', listener)
      }
    },
    // Fired when a pending sampling request was settled without the user (server
    // abort, call ended) and its modal should close.
    onSamplingClosed: (callback: (event: SamplingClosedEvent) => void): (() => void) => {
      const listener = (_: unknown, payload: SamplingClosedEvent): void => callback(payload)
      ipcRenderer.on('mcp:samplingClosed', listener)
      return () => {
        ipcRenderer.removeListener('mcp:samplingClosed', listener)
      }
    },
    respondToSampling: (samplingId: string, result: SamplingResult): Promise<void> =>
      ipcRenderer.invoke('mcp:respondToSampling', samplingId, result),
    // OAuth: trigger / re-trigger the authorization flow for a server.
    authorizeServer: (config: ServerConfig): Promise<void> =>
      ipcRenderer.invoke('mcp:authorizeServer', config),
    // OAuth: sign out — disconnect, clear tokens, reset auth state.
    clearAuth: (id: string): Promise<void> => ipcRenderer.invoke('mcp:clearAuth', id),
    // Whether OS-level encryption is available (gates OAuth mode in the UI).
    isEncryptionAvailable: (): Promise<boolean> => ipcRenderer.invoke('mcp:isEncryptionAvailable'),
    // Subscribes to OAuth flow events; returns an unsubscribe function.
    onAuthEvent: (callback: (event: AuthEvent) => void): (() => void) => {
      const listener = (_: unknown, payload: AuthEvent): void => callback(payload)
      ipcRenderer.on('mcp:authEvent', listener)
      return () => {
        ipcRenderer.removeListener('mcp:authEvent', listener)
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
