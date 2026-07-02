import { ElectronAPI } from '@electron-toolkit/preload'
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
  AuthEvent,
  AuthDetails
} from '../shared/mcp.types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      mcp: {
        getServers: () => Promise<LoadedServer[]>
        addServer: (config: ServerConfig) => Promise<LoadedServer>
        updateServer: (
          id: string,
          patch: Partial<Omit<ServerConfig, 'id'>>
        ) => Promise<LoadedServer>
        removeServer: (id: string) => Promise<void>
        getCachedCapabilities: () => Promise<Record<string, CachedCapabilities>>
        getAuthedServerIds: () => Promise<string[]>
        fetchCapabilities: (id: string) => Promise<ConnectResult>
        cancelCapabilities: (id: string) => Promise<void>
        clearCapabilities: (id: string) => Promise<void>
        disconnectServer: (id: string) => Promise<void>
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
        authorizeServer: (id: string) => Promise<void>
        clearAuth: (id: string) => Promise<void>
        getAuthDetails: (id: string) => Promise<AuthDetails | null>
        isEncryptionAvailable: () => Promise<boolean>
        onAuthEvent: (callback: (event: AuthEvent) => void) => () => void
      }
    }
  }
}
