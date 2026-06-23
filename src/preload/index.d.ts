import { ElectronAPI } from '@electron-toolkit/preload'
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      mcp: {
        getServers: () => Promise<ServerConfig[]>
        addServer: (config: ServerConfig) => Promise<void>
        updateServer: (id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => Promise<void>
        removeServer: (id: string) => Promise<void>
        getCachedCapabilities: () => Promise<Record<string, CachedCapabilities>>
        fetchCapabilities: (config: ServerConfig) => Promise<ConnectResult>
        clearCapabilities: (id: string) => Promise<void>
        disconnectServer: (id: string) => Promise<void>
        callTool: (
          config: ServerConfig,
          toolName: string,
          args: Record<string, unknown>,
          callId?: string,
          taskSupport?: TaskSupport
        ) => Promise<ToolCallOutcome>
        readResource: (config: ServerConfig, uri: string) => Promise<ResourceReadOutcome>
        getPrompt: (
          config: ServerConfig,
          name: string,
          args: Record<string, string>
        ) => Promise<PromptGetOutcome>
        onToolNotification: (callback: (event: ToolCallNotificationEvent) => void) => () => void
        onElicitationRequest: (callback: (event: ElicitationRequestEvent) => void) => () => void
        onElicitationClosed: (callback: (event: ElicitationClosedEvent) => void) => () => void
        respondToElicitation: (elicitationId: string, result: ElicitationResult) => Promise<void>
        onSamplingRequest: (callback: (event: SamplingRequestEvent) => void) => () => void
        onSamplingClosed: (callback: (event: SamplingClosedEvent) => void) => () => void
        respondToSampling: (samplingId: string, result: SamplingResult) => Promise<void>
      }
    }
  }
}
