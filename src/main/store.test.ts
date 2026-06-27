import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerConfig } from '../shared/mcp.types'

// Mock electron-store before importing store.ts. `path` is exposed so store.ts
// can chmod it; the mock points it at a real temp file so chmod is harmless.
vi.mock('electron-store', () => {
  class MockStore {
    private data: Record<string, unknown> = {}
    path = join(tmpdir(), `mcpflo-store-test-${randomUUID()}.json`)
    constructor({ defaults }: { defaults: Record<string, unknown> }) {
      this.data = structuredClone(defaults)
      writeFileSync(this.path, '{}')
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

// Mock Electron's safeStorage with a reversible stand-in so secrets round-trip
// in tests while staying obviously non-plaintext (prefixed + base64). A blob that
// decodes to the CORRUPT_BLOB marker throws on decrypt, simulating ciphertext
// from another machine/OS user that safeStorage can't open here.
const CORRUPT_BLOB = Buffer.from('corrupt').toString('base64')
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => {
      if (b.toString() === 'corrupt') throw new Error('cannot decrypt blob from another machine')
      return b.toString().replace(/^enc:/, '')
    }
  }
}))

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

const stdioWithSecret: ServerConfig = {
  id: 'stdio-secret',
  name: 'Stdio Secret',
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'srv'],
    env: { GITHUB_TOKEN: 'ghp_supersecret' }
  }
}

const httpWithSecret: ServerConfig = {
  id: 'http-secret',
  name: 'HTTP Secret',
  transport: {
    type: 'streamable-http',
    url: 'https://mcp.example.com/mcp',
    headers: { Authorization: 'Bearer tok_supersecret' }
  }
}

const oauthWithSecret: ServerConfig = {
  id: 'oauth-secret',
  name: 'OAuth Secret',
  transport: {
    type: 'streamable-http',
    url: 'https://oauth.example.com/mcp',
    auth: 'oauth',
    oauth: { clientId: 'public-client-id', clientSecret: 'oauth_supersecret', scope: 'read:tools' }
  }
}

const oauthSecretOnly: ServerConfig = {
  id: 'oauth-secret-only',
  name: 'OAuth Secret Only',
  transport: {
    type: 'streamable-http',
    url: 'https://oauth.example.com/mcp',
    auth: 'oauth',
    oauth: { clientSecret: 'oauth_lonely_secret' }
  }
}

describe('store', () => {
  let store: typeof import('./store').store
  let getServers: typeof import('./store').getServers
  let addServer: typeof import('./store').addServer
  let updateServer: typeof import('./store').updateServer
  let removeServer: typeof import('./store').removeServer
  let seedDefaultServers: typeof import('./store').seedDefaultServers

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./store')
    store = mod.store
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

  describe('secret encryption at rest', () => {
    it('round-trips stdio env secrets through getServers', () => {
      addServer(stdioWithSecret)
      expect(getServers()[0].transport).toEqual(stdioWithSecret.transport)
    })

    it('round-trips http header secrets through getServers', () => {
      addServer(httpWithSecret)
      expect(getServers()[0].transport).toEqual(httpWithSecret.transport)
    })

    it('never persists the secret value in cleartext', () => {
      addServer(stdioWithSecret)
      addServer(httpWithSecret)
      const raw = JSON.stringify(store.get('servers'))
      expect(raw).not.toContain('ghp_supersecret')
      expect(raw).not.toContain('tok_supersecret')
    })

    it('strips secret fields from the cleartext transport', () => {
      addServer(stdioWithSecret)
      const stored = store.get('servers')[0]
      expect((stored.transport as { env?: unknown }).env).toBeUndefined()
      expect(stored.secrets).toBeDefined()
    })

    it('re-encrypts secrets when the transport is patched', () => {
      addServer(stdioWithSecret)
      updateServer('stdio-secret', {
        transport: {
          type: 'stdio',
          command: 'npx',
          env: { GITHUB_TOKEN: 'ghp_rotated' }
        }
      })
      expect(getServers()[0].transport).toEqual({
        type: 'stdio',
        command: 'npx',
        env: { GITHUB_TOKEN: 'ghp_rotated' }
      })
      expect(JSON.stringify(store.get('servers'))).not.toContain('ghp_rotated')
    })

    it('drops the secret blob when a patch removes the secret', () => {
      addServer(stdioWithSecret)
      updateServer('stdio-secret', {
        transport: { type: 'stdio', command: 'npx' }
      })
      expect(store.get('servers')[0].secrets).toBeUndefined()
      expect(getServers()[0].transport).toEqual({ type: 'stdio', command: 'npx' })
    })

    it('round-trips the OAuth client secret while keeping clientId/scope cleartext', () => {
      addServer(oauthWithSecret)
      expect(getServers()[0].transport).toEqual(oauthWithSecret.transport)

      const stored = store.get('servers')[0]
      const oauth = (stored.transport as { oauth?: Record<string, unknown> }).oauth
      // Non-secret oauth fields stay in cleartext; only the secret is stripped.
      expect(oauth).toEqual({ clientId: 'public-client-id', scope: 'read:tools' })
      expect(JSON.stringify(store.get('servers'))).not.toContain('oauth_supersecret')
    })

    it('drops the oauth object from cleartext when the secret was its only field', () => {
      addServer(oauthSecretOnly)
      const stored = store.get('servers')[0]
      expect((stored.transport as { oauth?: unknown }).oauth).toBeUndefined()
      // …but it's restored intact on read.
      expect(getServers()[0].transport).toEqual(oauthSecretOnly.transport)
      expect(JSON.stringify(store.get('servers'))).not.toContain('oauth_lonely_secret')
    })

    it('re-encrypts an http header secret when the transport is patched', () => {
      addServer(httpWithSecret)
      updateServer('http-secret', {
        transport: {
          type: 'streamable-http',
          url: 'https://mcp.example.com/mcp',
          headers: { Authorization: 'Bearer tok_rotated' }
        }
      })
      expect(getServers()[0].transport).toEqual({
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer tok_rotated' }
      })
      // The cleartext transport never carries the header value.
      const stored = store.get('servers')[0]
      expect((stored.transport as { headers?: unknown }).headers).toBeUndefined()
      expect(JSON.stringify(store.get('servers'))).not.toContain('tok_rotated')
    })
  })

  describe('undecryptable secrets', () => {
    // A stored server whose encrypted blob can't be opened on this machine.
    function injectCorrupt(): void {
      store.set('servers', [
        ...store.get('servers'),
        {
          id: 'broken',
          name: 'Broken',
          transport: { type: 'streamable-http', url: 'https://broken.example.com/mcp' },
          secrets: CORRUPT_BLOB
        }
      ])
    }

    it('keeps loading other servers when one secret cannot be decrypted', () => {
      addServer(stdioWithSecret) // good, decryptable
      injectCorrupt()

      const loaded = getServers()
      expect(loaded).toHaveLength(2)
      // The unrelated server still loads with its secret intact.
      const good = loaded.find((s) => s.id === 'stdio-secret')
      expect(good?.transport).toEqual(stdioWithSecret.transport)
      expect(good?.credentialsUnavailable).toBeFalsy()
    })

    it('flags the undecryptable server with credentialsUnavailable and keeps its public config', () => {
      injectCorrupt()
      const broken = getServers().find((s) => s.id === 'broken')
      expect(broken?.credentialsUnavailable).toBe(true)
      expect(broken?.name).toBe('Broken')
      expect(broken?.transport).toEqual({
        type: 'streamable-http',
        url: 'https://broken.example.com/mcp'
      })
    })

    it('preserves the unreadable blob across a non-transport patch (rename)', () => {
      injectCorrupt()
      updateServer('broken', { name: 'Renamed' })
      const stored = store.get('servers').find((s) => s.id === 'broken')
      expect(stored?.name).toBe('Renamed')
      // The blob we couldn't read is kept, not silently dropped.
      expect(stored?.secrets).toBe(CORRUPT_BLOB)
    })

    it('preserves the unreadable blob across a transport edit that re-enters no credential', () => {
      injectCorrupt()
      // A URL-only edit touches the transport but supplies no new secret, so the
      // still-unreadable credential must survive rather than be destroyed.
      updateServer('broken', {
        transport: { type: 'streamable-http', url: 'https://moved.example.com/mcp' }
      })
      const stored = store.get('servers').find((s) => s.id === 'broken')
      expect((stored?.transport as { url: string }).url).toBe('https://moved.example.com/mcp')
      expect(stored?.secrets).toBe(CORRUPT_BLOB)
    })

    it('replaces the unreadable blob when a patch supplies a fresh credential', () => {
      injectCorrupt()
      updateServer('broken', {
        transport: {
          type: 'streamable-http',
          url: 'https://broken.example.com/mcp',
          headers: { Authorization: 'Bearer fresh' }
        }
      })
      const stored = store.get('servers').find((s) => s.id === 'broken')
      // A re-supplied secret supersedes the unreadable one (new ciphertext blob).
      expect(stored?.secrets).toBeDefined()
      expect(stored?.secrets).not.toBe(CORRUPT_BLOB)
      // …and it round-trips back out decrypted, clearing the unavailable flag.
      const loaded = getServers().find((s) => s.id === 'broken')
      expect(loaded?.credentialsUnavailable).toBeFalsy()
      expect((loaded?.transport as { headers?: Record<string, string> }).headers).toEqual({
        Authorization: 'Bearer fresh'
      })
    })

    it('never persists the credentialsUnavailable flag back to disk', () => {
      injectCorrupt()
      updateServer('broken', { name: 'Renamed' })
      const stored = store.get('servers').find((s) => s.id === 'broken')
      expect(Object.keys(stored ?? {})).not.toContain('credentialsUnavailable')
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
      updateServer('github-mcp', { name: 'Updated name' })
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
