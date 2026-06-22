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
        getSecretsStatus: () => Promise<{ plaintext: boolean }>
        getCachedCapabilities: () => Promise<Record<string, CachedCapabilities>>
        fetchCapabilities: (id: string) => Promise<ConnectResult>
        clearCapabilities: (id: string) => Promise<void>
        callTool: (
          id: string,
          toolName: string,
          args: Record<string, unknown>,
          callId?: string,
          taskSupport?: TaskSupport
        ) => Promise<ToolCallOutcome>
        readResource: (id: string, uri: string) => Promise<ResourceReadOutcome>
        getPrompt: (
          id: string,
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
