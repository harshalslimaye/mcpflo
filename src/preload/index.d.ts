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
  CompletionRef,
  CompletionOutcome,
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
import type { TestKind, TestRunSummary, RequestsFile } from '../shared/testing.types'
import type { UpdateStatus } from '../shared/updater.types'

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
        complete: (
          id: string,
          ref: CompletionRef,
          argument: { name: string; value: string },
          context?: { arguments?: Record<string, string> }
        ) => Promise<CompletionOutcome>
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
        getRequests: (id: string, kind: TestKind, name: string) => Promise<RequestsFile | null>
        saveRequests: (
          id: string,
          kind: TestKind,
          name: string,
          file: RequestsFile
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
      updater: {
        getStatus: () => Promise<UpdateStatus>
        check: () => Promise<UpdateStatus>
        install: () => Promise<void>
        onUpdateEvent: (callback: (status: UpdateStatus) => void) => () => void
      }
    }
  }
}
