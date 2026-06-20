import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ServerConfig } from '../shared/mcp.types'

// Mock electron-store before importing store.ts
vi.mock('electron-store', () => {
  class MockStore {
    private data: Record<string, unknown> = {}
    constructor({ defaults }: { defaults: Record<string, unknown> }) {
      this.data = structuredClone(defaults)
    }
    get(key: string): unknown {
      return this.data[key]
    }
    set(key: string, value: unknown): void {
      this.data[key] = value
    }
  }
  return { default: MockStore }
})

const githubConfig: ServerConfig = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] }
}

const slackConfig: ServerConfig = {
  id: 'slack-mcp',
  name: 'Slack MCP',
  transport: { type: 'streamable-http', url: 'https://slack.mcp.example.com/mcp' }
}

describe('store', () => {
  let getServers: typeof import('./store').getServers
  let addServer: typeof import('./store').addServer
  let updateServer: typeof import('./store').updateServer
  let removeServer: typeof import('./store').removeServer
  let seedDefaultServers: typeof import('./store').seedDefaultServers

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./store')
    getServers = mod.getServers
    addServer = mod.addServer
    updateServer = mod.updateServer
    removeServer = mod.removeServer
    seedDefaultServers = mod.seedDefaultServers
  })

  describe('getServers', () => {
    it('returns empty array on fresh store', () => {
      expect(getServers()).toEqual([])
    })
  })

  describe('addServer', () => {
    it('adds a server', () => {
      addServer(githubConfig)
      expect(getServers()).toHaveLength(1)
      expect(getServers()[0].id).toBe('github-mcp')
    })

    it('adds multiple servers', () => {
      addServer(githubConfig)
      addServer(slackConfig)
      expect(getServers()).toHaveLength(2)
    })

    it('throws when adding a duplicate id', () => {
      addServer(githubConfig)
      expect(() => addServer(githubConfig)).toThrow('already exists')
    })
  })

  describe('updateServer', () => {
    it('updates server name', () => {
      addServer(githubConfig)
      updateServer('github-mcp', { name: 'GitHub MCP v2' })
      expect(getServers()[0].name).toBe('GitHub MCP v2')
    })

    it('preserves other fields when patching', () => {
      addServer(githubConfig)
      updateServer('github-mcp', { description: 'Updated desc' })
      expect(getServers()[0].id).toBe('github-mcp')
      expect(getServers()[0].transport).toEqual(githubConfig.transport)
    })

    it('throws when server id not found', () => {
      expect(() => updateServer('nonexistent', { name: 'X' })).toThrow('not found')
    })
  })

  describe('removeServer', () => {
    it('removes a server', () => {
      addServer(githubConfig)
      removeServer('github-mcp')
      expect(getServers()).toHaveLength(0)
    })

    it('only removes the targeted server', () => {
      addServer(githubConfig)
      addServer(slackConfig)
      removeServer('github-mcp')
      expect(getServers()).toHaveLength(1)
      expect(getServers()[0].id).toBe('slack-mcp')
    })

    it('throws when server id not found', () => {
      expect(() => removeServer('nonexistent')).toThrow('not found')
    })
  })

  describe('seedDefaultServers', () => {
    it('seeds an example server on a fresh store', () => {
      seedDefaultServers()
      const servers = getServers()
      expect(servers).toHaveLength(1)
      expect(servers[0].name).toBe('Everything')
      expect(servers[0].transport).toEqual({
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything']
      })
    })

    it('is idempotent — does not re-seed on subsequent runs', () => {
      seedDefaultServers()
      seedDefaultServers()
      expect(getServers()).toHaveLength(1)
    })

    it('does not re-add the seed after the user deletes it', () => {
      seedDefaultServers()
      removeServer(getServers()[0].id)
      seedDefaultServers()
      expect(getServers()).toHaveLength(0)
    })

    it('does not seed when servers already exist', () => {
      addServer(githubConfig)
      seedDefaultServers()
      expect(getServers()).toHaveLength(1)
      expect(getServers()[0].id).toBe('github-mcp')
    })
  })
})
