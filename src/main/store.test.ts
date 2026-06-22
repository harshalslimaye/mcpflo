import { describe, it, expect, beforeEach, vi } from 'vitest'
import { REDACTED_SECRET, type ServerConfig } from '../shared/mcp.types'

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

// Mock the secrets layer with a reversible stand-in so encryption is
// deterministic and the OS keyring is never touched. `available` is mutable so
// tests can exercise the no-keyring plaintext fallback.
const secretsMock = vi.hoisted(() => {
  const PREFIX = 'enc:v1:'
  return {
    available: true,
    isAvailable: (): boolean => secretsMock.available,
    isEncrypted: (v: string): boolean => v.startsWith(PREFIX),
    encrypt: (plain: string): string => PREFIX + Buffer.from(plain).toString('base64'),
    decrypt: (v: string): string =>
      v.startsWith(PREFIX) ? Buffer.from(v.slice(PREFIX.length), 'base64').toString('utf8') : v
  }
})

vi.mock('./secrets', () => secretsMock)

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

// A token-bearing stdio server (env var) and a header-authed HTTP server, used
// to exercise the encrypt-on-write / redact-on-read / decrypt-for-connection
// paths.
const tokenStdioConfig: ServerConfig = {
  id: 'gh-token',
  name: 'GitHub (token)',
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: 'ghp_supersecret', PUBLIC: 'not-a-secret-but-still-masked' }
  }
}

const tokenHttpConfig: ServerConfig = {
  id: 'http-token',
  name: 'HTTP (bearer)',
  transport: {
    type: 'streamable-http',
    url: 'https://mcp.example.com/mcp',
    headers: { Authorization: 'Bearer abc123' }
  }
}

describe('store', () => {
  let mod: typeof import('./store')
  let getServers: typeof import('./store').getServers
  let addServer: typeof import('./store').addServer
  let updateServer: typeof import('./store').updateServer
  let removeServer: typeof import('./store').removeServer
  let seedDefaultServers: typeof import('./store').seedDefaultServers
  let getServerForConnection: typeof import('./store').getServerForConnection
  let secretsStoredAsPlaintext: typeof import('./store').secretsStoredAsPlaintext

  beforeEach(async () => {
    vi.resetModules()
    secretsMock.available = true
    mod = await import('./store')
    getServers = mod.getServers
    addServer = mod.addServer
    updateServer = mod.updateServer
    removeServer = mod.removeServer
    seedDefaultServers = mod.seedDefaultServers
    getServerForConnection = mod.getServerForConnection
    secretsStoredAsPlaintext = mod.secretsStoredAsPlaintext
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

  // The raw, on-disk representation (what electron-store would serialize).
  function rawServers(): ServerConfig[] {
    return mod.store.get('servers')
  }

  describe('secret storage', () => {
    it('encrypts stdio env values on write', () => {
      addServer(tokenStdioConfig)
      const stored = rawServers()[0].transport
      if (stored.type !== 'stdio') throw new Error('expected stdio')
      expect(stored.env?.GITHUB_TOKEN).toMatch(/^enc:v1:/)
      expect(stored.env?.GITHUB_TOKEN).not.toContain('ghp_supersecret')
      expect(stored.env?.PUBLIC).toMatch(/^enc:v1:/)
    })

    it('encrypts http header values on write', () => {
      addServer(tokenHttpConfig)
      const stored = rawServers()[0].transport
      if (stored.type !== 'streamable-http') throw new Error('expected http')
      expect(stored.headers?.Authorization).toMatch(/^enc:v1:/)
      expect(stored.headers?.Authorization).not.toContain('Bearer abc123')
    })

    it('never persists a plaintext secret anywhere in the stored config', () => {
      addServer(tokenStdioConfig)
      addServer(tokenHttpConfig)
      const serialized = JSON.stringify(rawServers())
      expect(serialized).not.toContain('ghp_supersecret')
      expect(serialized).not.toContain('Bearer abc123')
    })

    it('redacts secret values (keys preserved) in the renderer-facing list', () => {
      addServer(tokenStdioConfig)
      const transport = getServers()[0].transport
      if (transport.type !== 'stdio') throw new Error('expected stdio')
      expect(transport.env).toEqual({
        GITHUB_TOKEN: REDACTED_SECRET,
        PUBLIC: REDACTED_SECRET
      })
    })

    it('decrypts back to the original for a connection', () => {
      addServer(tokenStdioConfig)
      addServer(tokenHttpConfig)
      const stdio = getServerForConnection('gh-token').transport
      if (stdio.type !== 'stdio') throw new Error('expected stdio')
      expect(stdio.env).toEqual({
        GITHUB_TOKEN: 'ghp_supersecret',
        PUBLIC: 'not-a-secret-but-still-masked'
      })
      const http = getServerForConnection('http-token').transport
      if (http.type !== 'streamable-http') throw new Error('expected http')
      expect(http.headers).toEqual({ Authorization: 'Bearer abc123' })
    })

    it('throws from getServerForConnection when the server is unknown', () => {
      expect(() => getServerForConnection('nope')).toThrow('not found')
    })

    describe('when the keyring is unavailable', () => {
      beforeEach(() => {
        secretsMock.available = false
      })

      it('stores plaintext and raises the warning flag', () => {
        expect(secretsStoredAsPlaintext()).toBe(false)
        addServer(tokenStdioConfig)
        const stored = rawServers()[0].transport
        if (stored.type !== 'stdio') throw new Error('expected stdio')
        expect(stored.env?.GITHUB_TOKEN).toBe('ghp_supersecret')
        expect(secretsStoredAsPlaintext()).toBe(true)
      })

      it('still round-trips through getServerForConnection (plaintext passthrough)', () => {
        addServer(tokenStdioConfig)
        const stdio = getServerForConnection('gh-token').transport
        if (stdio.type !== 'stdio') throw new Error('expected stdio')
        expect(stdio.env?.GITHUB_TOKEN).toBe('ghp_supersecret')
      })

      it('does not raise the flag for a server with no secrets', () => {
        addServer(githubConfig)
        expect(secretsStoredAsPlaintext()).toBe(false)
      })
    })
  })

  describe('updateServer secret handling', () => {
    it('preserves a secret left as the redaction sentinel', () => {
      addServer(tokenStdioConfig)
      // Simulate a redacted config (as the renderer holds it) coming back with
      // one value changed and the other left masked.
      updateServer('gh-token', {
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: REDACTED_SECRET, PUBLIC: 'changed-value' }
        }
      })
      const stdio = getServerForConnection('gh-token').transport
      if (stdio.type !== 'stdio') throw new Error('expected stdio')
      expect(stdio.env).toEqual({
        GITHUB_TOKEN: 'ghp_supersecret', // unchanged: original preserved
        PUBLIC: 'changed-value' // changed: re-encrypted then decrypted
      })
    })

    it('re-encrypts a genuinely changed secret', () => {
      addServer(tokenStdioConfig)
      updateServer('gh-token', {
        transport: {
          type: 'stdio',
          command: 'npx',
          env: { GITHUB_TOKEN: 'ghp_rotated' }
        }
      })
      const stored = rawServers()[0].transport
      if (stored.type !== 'stdio') throw new Error('expected stdio')
      expect(stored.env?.GITHUB_TOKEN).toMatch(/^enc:v1:/)
      expect(getServerForConnection('gh-token').transport).toMatchObject({
        env: { GITHUB_TOKEN: 'ghp_rotated' }
      })
    })
  })
})
