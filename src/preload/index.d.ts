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
  AuthDetails,
  ToolCallResult,
  GetPromptResult,
  ResourceReadResult
} from '../shared/mcp.types'
import type { TestKind, TestRunSummary } from '../shared/testing.types'

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
      testing: {
        getScript: (id: string, kind: TestKind, name: string) => Promise<string | null>
        saveScript: (id: string, kind: TestKind, name: string, content: string) => Promise<void>
        saveInputs: (
          id: string,
          kind: TestKind,
          name: string,
          inputs: Record<string, unknown>
        ) => Promise<void>
        listScripts: (id: string) => Promise<{ kind: TestKind; name: string }[]>
        run: (input: {
          script: string
          kind?: TestKind
          result: ToolCallResult | GetPromptResult | ResourceReadResult
          callDurationMs?: number
        }) => Promise<TestRunSummary>
        chooseTestsFolder: (id: string) => Promise<string | null>
        getTestsFolderStatus: (
          id: string
        ) => Promise<{ path: string; isCustom: boolean; exists: boolean }>
      }
    }
  }
}
