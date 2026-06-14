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
    clearCapabilities: vi.fn<(id: string) => Promise<void>>(),
    callTool: vi.fn(),
    onToolNotification: vi.fn()
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
    mockApi.mcp.callTool.mockResolvedValue({
      response: { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'ok' }] } }
    })
    mockApi.mcp.onToolNotification.mockReturnValue(() => {})
    vi.resetModules()
    const mod = await import('./serverStore')
    useServerStore = mod.useServerStore
    useServerStore.setState({
      servers: [],
      selectedServerId: null,
      selectedTool: null,
      history: {},
      liveNotifications: {}
    })
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

  describe('selectTool', () => {
    it('sets the selected tool with its owning server id', () => {
      useServerStore.getState().selectTool('github-mcp', 'create_issue')
      expect(useServerStore.getState().selectedTool).toEqual({
        serverId: 'github-mcp',
        toolName: 'create_issue'
      })
    })

    it('replaces a previously selected tool', () => {
      useServerStore.getState().selectTool('github-mcp', 'create_issue')
      useServerStore.getState().selectTool('github-mcp', 'list_issues')
      expect(useServerStore.getState().selectedTool?.toolName).toBe('list_issues')
    })
  })

  describe('executeTool', () => {
    const key = 'github-mcp::create_issue'

    it('calls IPC with the server config, tool name and args', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', { title: 'x' })
      expect(mockApi.mcp.callTool).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'github-mcp' }),
        'create_issue',
        { title: 'x' },
        expect.any(String),
        undefined
      )
    })

    it('records a successful call in history', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', { title: 'x' })
      const records = useServerStore.getState().history[key]
      expect(records).toHaveLength(1)
      expect(records[0].status).toBe('success')
      expect(records[0].args).toEqual({ title: 'x' })
    })

    it('marks the call as an error when the result reports isError', async () => {
      mockApi.mcp.callTool.mockResolvedValue({
        response: { jsonrpc: '2.0', id: 1, result: { isError: true, content: [] } }
      })
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
      expect(useServerStore.getState().history[key][0].status).toBe('error')
    })

    it('marks the call as an error for a JSON-RPC error response', async () => {
      mockApi.mcp.callTool.mockResolvedValue({
        response: { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }
      })
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
      expect(useServerStore.getState().history[key][0].status).toBe('error')
    })

    it('marks an outcome with neither response nor error as an error', async () => {
      mockApi.mcp.callTool.mockResolvedValue({})
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
      const record = useServerStore.getState().history[key][0]
      expect(record.status).toBe('error')
      expect(record.response).toBeUndefined()
    })

    it('records a transport error returned by the outcome', async () => {
      mockApi.mcp.callTool.mockResolvedValue({ error: 'connection refused' })
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
      const record = useServerStore.getState().history[key][0]
      expect(record.status).toBe('error')
      expect(record.error).toBe('connection refused')
    })

    it('records an error when the IPC call rejects', async () => {
      mockApi.mcp.callTool.mockRejectedValue(new Error('ipc failed'))
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
      const record = useServerStore.getState().history[key][0]
      expect(record.status).toBe('error')
      expect(record.error).toBe('ipc failed')
    })

    it('stringifies a non-Error rejection in executeTool', async () => {
      mockApi.mcp.callTool.mockRejectedValue('raw string error')
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
      const record = useServerStore.getState().history[key][0]
      expect(record.error).toBe('raw string error')
    })

    it('prepends newer calls so the latest is first', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', { n: 1 })
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', { n: 2 })
      const records = useServerStore.getState().history[key]
      expect(records).toHaveLength(2)
      expect(records[0].args).toEqual({ n: 2 })
    })

    it('does nothing for an unknown server', async () => {
      await useServerStore.getState().executeTool('missing', 'create_issue', {})
      expect(mockApi.mcp.callTool).not.toHaveBeenCalled()
      expect(useServerStore.getState().history).toEqual({})
    })

    describe('notifications', () => {
      const progressNotification = {
        method: 'notifications/progress',
        params: { progress: 1, total: 5 },
        at: 123
      }

      // Wires the mocks so callTool emits the given notifications (tagged with
      // the callId it actually received, unless overridden) before resolving.
      function emitDuringCall(
        notifications: Array<Record<string, unknown>>,
        callIdOverride?: string
      ): void {
        let subscriber: ((event: never) => void) | undefined
        mockApi.mcp.onToolNotification.mockImplementation((cb) => {
          subscriber = cb
          return () => {
            subscriber = undefined
          }
        })
        mockApi.mcp.callTool.mockImplementation(async (_config, _tool, _args, callId) => {
          for (const notification of notifications) {
            subscriber?.({ callId: callIdOverride ?? callId, notification } as never)
          }
          return { response: { jsonrpc: '2.0', id: 1, result: { content: [] } } }
        })
      }

      it('exposes notifications via liveNotifications while the call runs', async () => {
        let subscriber: ((event: unknown) => void) | undefined
        mockApi.mcp.onToolNotification.mockImplementation((cb) => {
          subscriber = cb as (event: unknown) => void
          return () => {}
        })
        let liveDuringCall: unknown
        mockApi.mcp.callTool.mockImplementation(async (_config, _tool, _args, callId) => {
          subscriber?.({ callId, notification: progressNotification })
          liveDuringCall = useServerStore.getState().liveNotifications[key]
          return { response: { jsonrpc: '2.0', id: 1, result: { content: [] } } }
        })
        await useServerStore.getState().addServer(githubConfig)
        await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
        expect(liveDuringCall).toEqual([progressNotification])
      })

      it('persists collected notifications on the history record and clears live state', async () => {
        emitDuringCall([
          progressNotification,
          { ...progressNotification, params: { progress: 5, total: 5 } }
        ])
        await useServerStore.getState().addServer(githubConfig)
        await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
        const record = useServerStore.getState().history[key][0]
        expect(record.notifications).toHaveLength(2)
        expect(useServerStore.getState().liveNotifications[key]).toBeUndefined()
      })

      it('ignores notifications tagged with a different callId', async () => {
        emitDuringCall([progressNotification], 'some-other-call')
        await useServerStore.getState().addServer(githubConfig)
        await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
        expect(useServerStore.getState().history[key][0].notifications).toEqual([])
      })

      it('records an empty notifications array when none arrived', async () => {
        await useServerStore.getState().addServer(githubConfig)
        await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
        expect(useServerStore.getState().history[key][0].notifications).toEqual([])
      })

      it('keeps notifications received before a rejected IPC call', async () => {
        let subscriber: ((event: unknown) => void) | undefined
        mockApi.mcp.onToolNotification.mockImplementation((cb) => {
          subscriber = cb as (event: unknown) => void
          return () => {}
        })
        mockApi.mcp.callTool.mockImplementation(async (_config, _tool, _args, callId) => {
          subscriber?.({ callId, notification: progressNotification })
          throw new Error('ipc failed')
        })
        await useServerStore.getState().addServer(githubConfig)
        await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
        const record = useServerStore.getState().history[key][0]
        expect(record.status).toBe('error')
        expect(record.notifications).toEqual([progressNotification])
      })

      it('unsubscribes from the notification channel after the call settles', async () => {
        const unsubscribe = vi.fn()
        mockApi.mcp.onToolNotification.mockReturnValue(unsubscribe)
        await useServerStore.getState().addServer(githubConfig)
        await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
        expect(unsubscribe).toHaveBeenCalledTimes(1)
      })

      it('unsubscribes even when the IPC call rejects', async () => {
        const unsubscribe = vi.fn()
        mockApi.mcp.onToolNotification.mockReturnValue(unsubscribe)
        mockApi.mcp.callTool.mockRejectedValue(new Error('ipc failed'))
        await useServerStore.getState().addServer(githubConfig)
        await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
        expect(unsubscribe).toHaveBeenCalledTimes(1)
      })
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

    it('clears selectedTool if it belonged to the removed server', async () => {
      await useServerStore.getState().addServer(githubConfig)
      useServerStore.getState().selectTool('github-mcp', 'create_issue')
      await useServerStore.getState().removeServer('github-mcp')
      expect(useServerStore.getState().selectedTool).toBeNull()
    })

    it('preserves selectedTool if a different server is removed', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      useServerStore.getState().selectTool('github-mcp', 'create_issue')
      await useServerStore.getState().removeServer('slack-mcp')
      expect(useServerStore.getState().selectedTool?.serverId).toBe('github-mcp')
    })

    it('prunes call history belonging to the removed server', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
      await useServerStore.getState().executeTool('slack-mcp', 'post_message', {})
      await useServerStore.getState().removeServer('github-mcp')
      const history = useServerStore.getState().history
      expect(history['github-mcp::create_issue']).toBeUndefined()
      expect(history['slack-mcp::post_message']).toHaveLength(1)
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

    it('stringifies a non-Error rejection in fetchCapabilities', async () => {
      await useServerStore.getState().addServer(githubConfig)
      mockApi.mcp.fetchCapabilities.mockRejectedValue('timeout')
      await useServerStore.getState().fetchCapabilities('github-mcp')
      const server = useServerStore.getState().servers.find((s) => s.id === 'github-mcp')
      expect(server?.status).toBe('error')
      expect(server?.error).toBe('timeout')
    })

    it('does nothing when server id not found', async () => {
      await useServerStore.getState().fetchCapabilities('nonexistent')
      expect(mockApi.mcp.fetchCapabilities).not.toHaveBeenCalled()
    })

    it('leaves other servers untouched while fetching one (error path)', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      mockApi.mcp.fetchCapabilities.mockRejectedValue(new Error('boom'))
      await useServerStore.getState().fetchCapabilities('github-mcp')
      const slack = useServerStore.getState().servers.find((s) => s.id === 'slack-mcp')
      expect(slack?.status).toBe('disconnected')
      expect(slack?.error).toBeUndefined()
    })

    it('leaves other servers untouched while fetching one (success path)', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      await useServerStore.getState().fetchCapabilities('github-mcp')
      const slack = useServerStore.getState().servers.find((s) => s.id === 'slack-mcp')
      expect(slack?.status).toBe('disconnected')
      expect(slack?.tools).toEqual([])
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
