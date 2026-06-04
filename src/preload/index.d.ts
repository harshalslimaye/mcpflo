import { ElectronAPI } from '@electron-toolkit/preload'
import type { ServerConfig, ConnectResult } from '../shared/mcp.types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      mcp: {
        getServers: () => Promise<ServerConfig[]>
        addServer: (config: ServerConfig) => Promise<void>
        updateServer: (id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => Promise<void>
        removeServer: (id: string) => Promise<void>
        connectServer: (config: ServerConfig) => Promise<ConnectResult>
        disconnectServer: (id: string) => Promise<void>
      }
    }
  }
}
