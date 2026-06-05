import { ElectronAPI } from '@electron-toolkit/preload'
import type { ServerConfig, ConnectResult, CachedCapabilities } from '../shared/mcp.types'

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
      }
    }
  }
}
