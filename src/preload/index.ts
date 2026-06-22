import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ServerConfig,
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
  SamplingResult
} from '../shared/mcp.types'

const api = {
  mcp: {
    getServers: (): Promise<ServerConfig[]> => ipcRenderer.invoke('mcp:getServers'),
    addServer: (config: ServerConfig): Promise<void> => ipcRenderer.invoke('mcp:addServer', config),
    updateServer: (id: string, patch: Partial<Omit<ServerConfig, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('mcp:updateServer', id, patch),
    removeServer: (id: string): Promise<void> => ipcRenderer.invoke('mcp:removeServer', id),
    getSecretsStatus: (): Promise<{ plaintext: boolean }> =>
      ipcRenderer.invoke('mcp:getSecretsStatus'),
    getCachedCapabilities: (): Promise<Record<string, CachedCapabilities>> =>
      ipcRenderer.invoke('mcp:getCachedCapabilities'),
    // Connection calls take a server id; the main process resolves the
    // decrypted config itself, so secrets never cross IPC.
    fetchCapabilities: (id: string): Promise<ConnectResult> =>
      ipcRenderer.invoke('mcp:fetchCapabilities', id),
    clearCapabilities: (id: string): Promise<void> =>
      ipcRenderer.invoke('mcp:clearCapabilities', id),
    callTool: (
      id: string,
      toolName: string,
      args: Record<string, unknown>,
      callId?: string,
      taskSupport?: TaskSupport
    ): Promise<ToolCallOutcome> =>
      ipcRenderer.invoke('mcp:callTool', id, toolName, args, callId, taskSupport),
    readResource: (id: string, uri: string): Promise<ResourceReadOutcome> =>
      ipcRenderer.invoke('mcp:readResource', id, uri),
    getPrompt: (
      id: string,
      name: string,
      args: Record<string, string>
    ): Promise<PromptGetOutcome> => ipcRenderer.invoke('mcp:getPrompt', id, name, args),
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
      ipcRenderer.invoke('mcp:respondToSampling', samplingId, result)
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
