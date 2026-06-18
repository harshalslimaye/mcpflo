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
  transport: { type: 'streamable-http', url: 'https://slack.example.com/mcp' }
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
    readResource: vi.fn(),
    getPrompt: vi.fn(),
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
    mockApi.mcp.readResource.mockResolvedValue({
      response: { jsonrpc: '2.0', result: { contents: [{ uri: 'mem://x', text: 'ok' }] } }
    })
    mockApi.mcp.getPrompt.mockResolvedValue({
      response: {
        jsonrpc: '2.0',
        result: { messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }] }
      }
    })
    vi.resetModules()
    const mod = await import('./serverStore')
    useServerStore = mod.useServerStore
    useServerStore.setState({
      servers: [],
      selectedServerId: null,
      selectedTool: null,
      selectedResource: null,
      selectedPrompt: null,
      history: {},
      resourceHistory: {},
      promptHistory: {},
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

    it('swallows a read failure instead of rejecting', async () => {
      mockApi.mcp.getServers.mockRejectedValue(new Error('disk error'))
      // hydrate is fired from an effect with no catch, so it must not reject.
      await expect(useServerStore.getState().hydrate()).resolves.toBeUndefined()
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

    it('clears a selected resource (the two are mutually exclusive)', () => {
      useServerStore.getState().selectResource('github-mcp', 'mem://x')
      useServerStore.getState().selectTool('github-mcp', 'create_issue')
      expect(useServerStore.getState().selectedResource).toBeNull()
      expect(useServerStore.getState().selectedTool?.toolName).toBe('create_issue')
    })
  })

  describe('selectResource', () => {
    it('sets the selected resource with its owning server id', () => {
      useServerStore.getState().selectResource('github-mcp', 'mem://x')
      expect(useServerStore.getState().selectedResource).toEqual({
        serverId: 'github-mcp',
        uri: 'mem://x'
      })
    })

    it('clears a selected tool (the two are mutually exclusive)', () => {
      useServerStore.getState().selectTool('github-mcp', 'create_issue')
      useServerStore.getState().selectResource('github-mcp', 'mem://x')
      expect(useServerStore.getState().selectedTool).toBeNull()
      expect(useServerStore.getState().selectedResource?.uri).toBe('mem://x')
    })
  })

  describe('selectPrompt', () => {
    it('sets the selected prompt with its owning server id', () => {
      useServerStore.getState().selectPrompt('github-mcp', 'summarize')
      expect(useServerStore.getState().selectedPrompt).toEqual({
        serverId: 'github-mcp',
        promptName: 'summarize'
      })
    })

    it('clears a selected tool and resource (all three are mutually exclusive)', () => {
      useServerStore.getState().selectTool('github-mcp', 'create_issue')
      useServerStore.getState().selectResource('github-mcp', 'mem://x')
      useServerStore.getState().selectPrompt('github-mcp', 'summarize')
      expect(useServerStore.getState().selectedTool).toBeNull()
      expect(useServerStore.getState().selectedResource).toBeNull()
      expect(useServerStore.getState().selectedPrompt?.promptName).toBe('summarize')
    })

    it('is cleared when a tool is then selected', () => {
      useServerStore.getState().selectPrompt('github-mcp', 'summarize')
      useServerStore.getState().selectTool('github-mcp', 'create_issue')
      expect(useServerStore.getState().selectedPrompt).toBeNull()
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

    it('does nothing for an unknown server (executeTool)', async () => {
      await useServerStore.getState().executeTool('missing', 'create_issue', {})
      expect(mockApi.mcp.callTool).not.toHaveBeenCalled()
      expect(useServerStore.getState().history).toEqual({})
    })

    it('caps history at 50 records, dropping the oldest', async () => {
      await useServerStore.getState().addServer(githubConfig)
      for (let i = 0; i < 55; i++) {
        await useServerStore.getState().executeTool('github-mcp', 'create_issue', { n: i })
      }
      const records = useServerStore.getState().history[key]
      expect(records).toHaveLength(50)
      // Newest first; the 5 oldest (n: 0..4) were dropped.
      expect(records[0].args).toEqual({ n: 54 })
      expect(records[49].args).toEqual({ n: 5 })
    })

    it('drops and flags an oversized response', async () => {
      mockApi.mcp.callTool.mockResolvedValue({
        response: {
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: 'x'.repeat(300_000) }] }
        }
      })
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().executeTool('github-mcp', 'create_issue', {})
      const record = useServerStore.getState().history[key][0]
      expect(record.responseTruncated).toBe(true)
      expect(record.response).toBeUndefined()
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

  describe('readResource', () => {
    const key = 'github-mcp::mem://x'

    it('calls IPC with the server config and uri', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().readResource('github-mcp', 'mem://x')
      expect(mockApi.mcp.readResource).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'github-mcp' }),
        'mem://x'
      )
    })

    it('records a successful read in resource history', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().readResource('github-mcp', 'mem://x')
      const records = useServerStore.getState().resourceHistory[key]
      expect(records).toHaveLength(1)
      expect(records[0].status).toBe('success')
      expect(records[0].uri).toBe('mem://x')
    })

    it('marks the read as an error for a JSON-RPC error response', async () => {
      mockApi.mcp.readResource.mockResolvedValue({
        response: { jsonrpc: '2.0', error: { code: -32602, message: 'Resource not found' } }
      })
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().readResource('github-mcp', 'mem://x')
      expect(useServerStore.getState().resourceHistory[key][0].status).toBe('error')
    })

    it('records a transport error returned by the outcome', async () => {
      mockApi.mcp.readResource.mockResolvedValue({ error: 'connection refused' })
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().readResource('github-mcp', 'mem://x')
      const record = useServerStore.getState().resourceHistory[key][0]
      expect(record.status).toBe('error')
      expect(record.error).toBe('connection refused')
    })

    it('records an error when the IPC call rejects', async () => {
      mockApi.mcp.readResource.mockRejectedValue(new Error('ipc failed'))
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().readResource('github-mcp', 'mem://x')
      const record = useServerStore.getState().resourceHistory[key][0]
      expect(record.status).toBe('error')
      expect(record.error).toBe('ipc failed')
    })

    it('prepends newer reads so the latest is first', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().readResource('github-mcp', 'mem://x')
      await useServerStore.getState().readResource('github-mcp', 'mem://x')
      expect(useServerStore.getState().resourceHistory[key]).toHaveLength(2)
    })

    it('does nothing for an unknown server', async () => {
      await useServerStore.getState().readResource('missing', 'mem://x')
      expect(mockApi.mcp.readResource).not.toHaveBeenCalled()
      expect(useServerStore.getState().resourceHistory).toEqual({})
    })
  })

  describe('getPrompt', () => {
    const key = 'github-mcp::summarize'

    it('calls IPC with the server config, name and args', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().getPrompt('github-mcp', 'summarize', { topic: 'mcp' })
      expect(mockApi.mcp.getPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'github-mcp' }),
        'summarize',
        { topic: 'mcp' }
      )
    })

    it('records a successful get in prompt history', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().getPrompt('github-mcp', 'summarize', { topic: 'mcp' })
      const records = useServerStore.getState().promptHistory[key]
      expect(records).toHaveLength(1)
      expect(records[0].status).toBe('success')
      expect(records[0].promptName).toBe('summarize')
      expect(records[0].args).toEqual({ topic: 'mcp' })
    })

    it('marks the get as an error for a JSON-RPC error response', async () => {
      mockApi.mcp.getPrompt.mockResolvedValue({
        response: { jsonrpc: '2.0', error: { code: -32602, message: 'Prompt not found' } }
      })
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().getPrompt('github-mcp', 'summarize', {})
      expect(useServerStore.getState().promptHistory[key][0].status).toBe('error')
    })

    it('records a transport error returned by the outcome', async () => {
      mockApi.mcp.getPrompt.mockResolvedValue({ error: 'connection refused' })
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().getPrompt('github-mcp', 'summarize', {})
      const record = useServerStore.getState().promptHistory[key][0]
      expect(record.status).toBe('error')
      expect(record.error).toBe('connection refused')
    })

    it('records an error when the IPC call rejects', async () => {
      mockApi.mcp.getPrompt.mockRejectedValue(new Error('ipc failed'))
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().getPrompt('github-mcp', 'summarize', {})
      const record = useServerStore.getState().promptHistory[key][0]
      expect(record.status).toBe('error')
      expect(record.error).toBe('ipc failed')
    })

    it('prepends newer gets so the latest is first', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().getPrompt('github-mcp', 'summarize', {})
      await useServerStore.getState().getPrompt('github-mcp', 'summarize', {})
      expect(useServerStore.getState().promptHistory[key]).toHaveLength(2)
    })

    it('does nothing for an unknown server', async () => {
      await useServerStore.getState().getPrompt('missing', 'summarize', {})
      expect(mockApi.mcp.getPrompt).not.toHaveBeenCalled()
      expect(useServerStore.getState().promptHistory).toEqual({})
    })
  })

  describe('clearPromptHistory', () => {
    it('drops the history for one prompt, leaving others intact', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().getPrompt('github-mcp', 'summarize', {})
      await useServerStore.getState().getPrompt('github-mcp', 'translate', {})
      useServerStore.getState().clearPromptHistory('github-mcp', 'summarize')
      const promptHistory = useServerStore.getState().promptHistory
      expect(promptHistory['github-mcp::summarize']).toBeUndefined()
      expect(promptHistory['github-mcp::translate']).toHaveLength(1)
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

    it('re-throws and does not append when the IPC rejects', async () => {
      mockApi.mcp.addServer.mockRejectedValue(new Error('already exists'))
      await expect(useServerStore.getState().addServer(githubConfig)).rejects.toThrow(
        'already exists'
      )
      expect(useServerStore.getState().servers).toHaveLength(0)
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

    it('re-throws and leaves state unchanged when the IPC rejects', async () => {
      await useServerStore.getState().addServer(githubConfig)
      mockApi.mcp.updateServer.mockRejectedValue(new Error('not found'))
      await expect(
        useServerStore.getState().updateServer('github-mcp', { name: 'Updated' })
      ).rejects.toThrow('not found')
      expect(useServerStore.getState().servers[0].name).toBe('GitHub MCP')
    })
  })

  describe('removeServer', () => {
    it('calls IPC and removes server from state', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().removeServer('github-mcp')
      expect(mockApi.mcp.removeServer).toHaveBeenCalledWith('github-mcp')
      expect(useServerStore.getState().servers).toHaveLength(0)
    })

    it('re-throws and keeps the server when the IPC rejects', async () => {
      await useServerStore.getState().addServer(githubConfig)
      mockApi.mcp.removeServer.mockRejectedValue(new Error('not found'))
      await expect(useServerStore.getState().removeServer('github-mcp')).rejects.toThrow(
        'not found'
      )
      expect(useServerStore.getState().servers).toHaveLength(1)
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

    it('clears selectedResource if it belonged to the removed server', async () => {
      await useServerStore.getState().addServer(githubConfig)
      useServerStore.getState().selectResource('github-mcp', 'mem://x')
      await useServerStore.getState().removeServer('github-mcp')
      expect(useServerStore.getState().selectedResource).toBeNull()
    })

    it('preserves selectedResource if a different server is removed', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      useServerStore.getState().selectResource('github-mcp', 'mem://x')
      await useServerStore.getState().removeServer('slack-mcp')
      expect(useServerStore.getState().selectedResource?.serverId).toBe('github-mcp')
    })

    it('prunes resource read history belonging to the removed server', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      await useServerStore.getState().readResource('github-mcp', 'mem://x')
      await useServerStore.getState().readResource('slack-mcp', 'mem://y')
      await useServerStore.getState().removeServer('github-mcp')
      const resourceHistory = useServerStore.getState().resourceHistory
      expect(resourceHistory['github-mcp::mem://x']).toBeUndefined()
      expect(resourceHistory['slack-mcp::mem://y']).toHaveLength(1)
    })

    it('clears selectedPrompt if it belonged to the removed server', async () => {
      await useServerStore.getState().addServer(githubConfig)
      useServerStore.getState().selectPrompt('github-mcp', 'summarize')
      await useServerStore.getState().removeServer('github-mcp')
      expect(useServerStore.getState().selectedPrompt).toBeNull()
    })

    it('preserves selectedPrompt if a different server is removed', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      useServerStore.getState().selectPrompt('github-mcp', 'summarize')
      await useServerStore.getState().removeServer('slack-mcp')
      expect(useServerStore.getState().selectedPrompt?.serverId).toBe('github-mcp')
    })

    it('prunes prompt get history belonging to the removed server', async () => {
      await useServerStore.getState().addServer(githubConfig)
      await useServerStore.getState().addServer(slackConfig)
      await useServerStore.getState().getPrompt('github-mcp', 'summarize', {})
      await useServerStore.getState().getPrompt('slack-mcp', 'translate', {})
      await useServerStore.getState().removeServer('github-mcp')
      const promptHistory = useServerStore.getState().promptHistory
      expect(promptHistory['github-mcp::summarize']).toBeUndefined()
      expect(promptHistory['slack-mcp::translate']).toHaveLength(1)
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

    it('still fetches when the cache clear fails', async () => {
      await useServerStore.getState().addServer(githubConfig)
      mockApi.mcp.clearCapabilities.mockRejectedValue(new Error('rm failed'))
      const tools = [{ name: 'list_issues', inputSchema: { type: 'object' as const } }]
      mockApi.mcp.fetchCapabilities.mockResolvedValue({ tools, resources: [], prompts: [] })
      // A failed clear must not strand the refresh nor reject.
      await expect(
        useServerStore.getState().refreshCapabilities('github-mcp')
      ).resolves.toBeUndefined()
      expect(mockApi.mcp.fetchCapabilities).toHaveBeenCalled()
      expect(useServerStore.getState().servers[0].status).toBe('connected')
    })
  })
})
