import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ServerConfig, CachedCapabilities } from '../../shared/mcp.types'

const githubConfig: ServerConfig = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  transport: { type: 'stdio', command: 'npx' }
}

const slackConfig: ServerConfig = {
  id: 'slack-mcp',
  name: 'Slack MCP',
  transport: { type: 'sse', url: 'https://slack.example.com/sse' }
}

const mockApi = {
  mcp: {
    getServers: vi.fn<() => Promise<ServerConfig[]>>(),
    addServer: vi.fn<(c: ServerConfig) => Promise<void>>(),
    updateServer: vi.fn<(id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => Promise<void>>(),
    removeServer: vi.fn<(id: string) => Promise<void>>(),
    getCachedCapabilities: vi.fn<() => Promise<Record<string, CachedCapabilities>>>(),
    fetchCapabilities: vi.fn(),
    clearCapabilities: vi.fn<(id: string) => Promise<void>>()
  }
}

// Expose mock as window.api before the store module loads
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true })
;(globalThis as Record<string, unknown>).api = mockApi

describe('serverStore', () => {
  let useServerStore: typeof import('./serverStore').useServerStore

  beforeEach(async () => {
    vi.clearAllMocks()
    mockApi.mcp.getServers.mockResolvedValue([])
    mockApi.mcp.addServer.mockResolvedValue(undefined)
    mockApi.mcp.updateServer.mockResolvedValue(undefined)
    mockApi.mcp.removeServer.mockResolvedValue(undefined)
    mockApi.mcp.getCachedCapabilities.mockResolvedValue({})
    mockApi.mcp.fetchCapabilities.mockResolvedValue({ tools: [], resources: [], prompts: [] })
    mockApi.mcp.clearCapabilities.mockResolvedValue(undefined)
    vi.resetModules()
    const mod = await import('./serverStore')
    useServerStore = mod.useServerStore
    useServerStore.setState({ servers: [], selectedServerId: null })
  })

  describe('hydrate', () => {
    it('loads an uncached server as a grey (disconnected) runtime server', async () => {
      mockApi.mcp.getServers.mockResolvedValue([githubConfig])
      await useServerStore.getState().hydrate()
      const servers = useServerStore.getState().servers
      expect(servers).toHaveLength(1)
      expect(servers[0].id).toBe('github-mcp')
      expect(servers[0].status).toBe('disconnected')
      expect(servers[0].fetchedAt).toBeUndefined()
      expect(servers[0].tools).toEqual([])
      expect(servers[0].resources).toEqual([])
      expect(servers[0].prompts).toEqual([])
    })

    it('loads a cached server as green with its capabilities populated', async () => {
      mockApi.mcp.getServers.mockResolvedValue([githubConfig])
      mockApi.mcp.getCachedCapabilities.mockResolvedValue({
        'github-mcp': {
          tools: [{ name: 'list_issues', inputSchema: { type: 'object' } }],
          resources: [],
          prompts: [],
          fetchedAt: 1000
        }
      })
      await useServerStore.getState().hydrate()
      const server = useServerStore.getState().servers[0]
      expect(server.status).toBe('connected')
      expect(server.fetchedAt).toBe(1000)
      expect(server.tools).toHaveLength(1)
      expect(server.tools[0].name).toBe('list_issues')
    })

    it('sets empty array when no servers stored', async () => {
      await useServerStore.getState().hydrate()
      expect(useServerStore.getState().servers).toHaveLength(0)
    })
  })

  describe('selectServer', () => {
    it('sets selectedServerId', () => {
      useServerStore.getState().selectServer('github-mcp')
      expect(useServerStore.getState().selectedServerId).toBe('github-mcp')
    })

    it('clears selectedServerId when passed null', () => {
      useServerStore.getState().selectServer('github-mcp')
      useServerStore.getState().selectServer(null)
      expect(useServerStore.getState().selectedServerId).toBeNull()
    })
  })

  describe('addServer', () => {
    it('calls IPC and appends server to state', async () => {
      await useServerStore.getState().addServer(githubConfig)
      expect(mockApi.mcp.addServer).toHaveBeenCalledWith(githubConfig)
      expect(useServerStore.getState().servers).toHaveLength(1)
    })

    it('initialises added server with disconnected status', async () => {
      await useServerStore.getState().addServer(githubConfig)
      expect(useServerStore.getState().servers[0].status).toBe('disconnected')
    })

    it('initialises added server with empty capability arrays', async () => {
      await useServerStore.getState().addServer(githubConfig)
      const s = useServerStore.getState().servers[0]
      expect(s.tools).toEqual([])
      expect(s.resources).toEqual([])
      expect(s.prompts).toEqual([])
    })
  })

  describe('updateServer', () => {
    it('calls IPC and patches server in state', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().updateServer('github-mcp', { name: 'GitHub MCP v2' })
      expect(mockApi.mcp.updateServer).toHaveBeenCalledWith('github-mcp', { name: 'GitHub MCP v2' })
      expect(useServerStore.getState().servers[0].name).toBe('GitHub MCP v2')
    })

    it('only patches the targeted server', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      await useServerStore.getState().updateServer('github-mcp', { name: 'Updated' })
      expect(useServerStore.getState().servers[1].name).toBe('Slack MCP')
    })
  })

  describe('removeServer', () => {
    it('calls IPC and removes server from state', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().removeServer('github-mcp')
      expect(mockApi.mcp.removeServer).toHaveBeenCalledWith('github-mcp')
      expect(useServerStore.getState().servers).toHaveLength(0)
    })

    it('clears selectedServerId if the removed server was selected', async () => {
      await useServerStore.getState().addServer(githubConfig)
      useServerStore.getState().selectServer('github-mcp')
      await useServerStore.getState().removeServer('github-mcp')
      expect(useServerStore.getState().selectedServerId).toBeNull()
    })

    it('preserves selectedServerId if a different server is removed', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      useServerStore.getState().selectServer('github-mcp')
      await useServerStore.getState().removeServer('slack-mcp')
      expect(useServerStore.getState().selectedServerId).toBe('github-mcp')
    })
  })

  describe('fetchCapabilities', () => {
    it('sets status to connected and records fetchedAt on success', async () => {
      await useServerStore.getState().addServer(githubConfig)
      const tools = [{ name: 'list_issues', inputSchema: { type: 'object' as const } }]
      mockApi.mcp.fetchCapabilities.mockResolvedValue({ tools, resources: [], prompts: [] })
      await useServerStore.getState().fetchCapabilities('github-mcp')
      const server = useServerStore.getState().servers.find((s) => s.id === 'github-mcp')
      expect(server?.status).toBe('connected')
      expect(server?.fetchedAt).toEqual(expect.any(Number))
      expect(server?.tools).toEqual(tools)
      expect(server?.resources).toEqual([])
      expect(server?.prompts).toEqual([])
    })

    it('sets status to error on failure', async () => {
      await useServerStore.getState().addServer(githubConfig)
      mockApi.mcp.fetchCapabilities.mockRejectedValue(new Error('Connection refused'))
      await useServerStore.getState().fetchCapabilities('github-mcp')
      const server = useServerStore.getState().servers.find((s) => s.id === 'github-mcp')
      expect(server?.status).toBe('error')
      expect(server?.error).toBe('Connection refused')
    })

    it('does nothing when server id not found', async () => {
      await useServerStore.getState().fetchCapabilities('nonexistent')
      expect(mockApi.mcp.fetchCapabilities).not.toHaveBeenCalled()
    })

    it('passes full server config to IPC', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().fetchCapabilities('github-mcp')
      expect(mockApi.mcp.fetchCapabilities).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'github-mcp' })
      )
    })
  })

  describe('refreshCapabilities', () => {
    it('clears the cache then fetches again', async () => {
      await useServerStore.getState().addServer(githubConfig)
      const tools = [{ name: 'list_issues', inputSchema: { type: 'object' as const } }]
      mockApi.mcp.fetchCapabilities.mockResolvedValue({ tools, resources: [], prompts: [] })
      await useServerStore.getState().refreshCapabilities('github-mcp')
      expect(mockApi.mcp.clearCapabilities).toHaveBeenCalledWith('github-mcp')
      expect(mockApi.mcp.fetchCapabilities).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'github-mcp' })
      )
      const server = useServerStore.getState().servers.find((s) => s.id === 'github-mcp')
      expect(server?.status).toBe('connected')
      expect(server?.tools).toEqual(tools)
    })
  })
})
