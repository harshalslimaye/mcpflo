import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerConfig } from '../../shared/mcp.types'

interface MockTransport {
  url?: URL
  opts: Record<string, unknown> | undefined
}

const h = vi.hoisted(() => ({
  transports: [] as MockTransport[],
  resolveShellPath: vi.fn<() => string | undefined>(() => '/opt/homebrew/bin:/usr/bin')
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    opts: Record<string, unknown>
    constructor(opts: Record<string, unknown>) {
      this.opts = opts
      h.transports.push(this)
    }
  },
  getDefaultEnvironment: () => ({ PATH: '/usr/bin' })
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    url: URL
    opts: Record<string, unknown> | undefined
    constructor(url: URL, opts?: Record<string, unknown>) {
      this.url = url
      this.opts = opts
      h.transports.push(this)
    }
  }
}))

vi.mock('../shellPath', () => ({ resolveShellPath: h.resolveShellPath }))

import { createTransport, assertCredentialSafe } from './transportFactory'

const stdioConfig: ServerConfig = {
  id: 'srv-1',
  name: 'Test Server',
  transport: { type: 'stdio', command: 'npx', args: ['-y', 'server'], env: { FOO: 'bar' } }
}

function lastTransport(): MockTransport {
  return h.transports[h.transports.length - 1]
}

describe('transportFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.transports.length = 0
    h.resolveShellPath.mockReturnValue('/opt/homebrew/bin:/usr/bin')
  })

  describe('createTransport', () => {
    it('spawns with the login-shell PATH plus the safe default and configured vars', () => {
      createTransport(stdioConfig)
      expect(lastTransport().opts).toEqual({
        command: 'npx',
        args: ['-y', 'server'],
        // PATH comes from the resolved login shell, overriding the default env's.
        env: { PATH: '/opt/homebrew/bin:/usr/bin', FOO: 'bar' }
      })
    })

    it('keeps the default env PATH when login-shell resolution yields nothing', () => {
      h.resolveShellPath.mockReturnValue(undefined)
      createTransport(stdioConfig)
      expect((lastTransport().opts?.env as Record<string, string>).PATH).toBe('/usr/bin')
    })

    it('lets a user-configured PATH override the resolved login-shell PATH', () => {
      createTransport({
        ...stdioConfig,
        transport: { type: 'stdio', command: 'npx', args: [], env: { PATH: '/custom/bin' } }
      })
      expect((lastTransport().opts?.env as Record<string, string>).PATH).toBe('/custom/bin')
    })

    it('builds a streamable-http transport with the URL and auth headers', () => {
      createTransport({
        id: 'srv-4',
        name: 'Streamable HTTP Server',
        transport: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer tok' }
        }
      })
      const t = lastTransport()
      expect(t.url?.toString()).toBe('https://example.com/mcp')
      expect(t.opts).toEqual({ requestInit: { headers: { Authorization: 'Bearer tok' } } })
    })

    it('passes no opts to a streamable-http transport without headers', () => {
      createTransport({
        id: 'srv-5',
        name: 'Streamable HTTP Server (no auth)',
        transport: { type: 'streamable-http', url: 'https://example.com/mcp' }
      })
      expect(lastTransport().opts).toBeUndefined()
    })

    it('refuses to build a transport that ships a credential header over plain http', () => {
      // A config that bypassed the form (e.g. hand-edited config.json) must not
      // leak a credential in cleartext — the guard fails the connect.
      expect(() =>
        createTransport({
          id: 'srv-insecure',
          name: 'Insecure',
          transport: {
            type: 'streamable-http',
            url: 'http://mcp.example.com/mcp',
            headers: { Authorization: 'Bearer tok' }
          }
        })
      ).toThrow('cleartext over http')
    })

    it('allows a credential header over http to a loopback host', () => {
      expect(() =>
        createTransport({
          id: 'srv-local',
          name: 'Local',
          transport: {
            type: 'streamable-http',
            url: 'http://127.0.0.1:8080/mcp',
            headers: { Authorization: 'Bearer tok' }
          }
        })
      ).not.toThrow()
    })

    it('refuses an OAuth transport over plain http to a non-loopback host even with no static headers', () => {
      // The OAuth provider attaches Authorization: Bearer <token> itself at
      // request time — it never appears in `headers`, so this must be caught
      // independent of whatever static headers are (or aren't) configured.
      expect(() =>
        createTransport({
          id: 'srv-oauth-insecure',
          name: 'Insecure OAuth',
          transport: {
            type: 'streamable-http',
            url: 'http://mcp.example.com/mcp',
            auth: 'oauth'
          }
        })
      ).toThrow('cleartext over http')
    })

    it('allows an OAuth transport over http to a loopback host', () => {
      expect(() =>
        createTransport({
          id: 'srv-oauth-local',
          name: 'Local OAuth',
          transport: {
            type: 'streamable-http',
            url: 'http://127.0.0.1:8080/mcp',
            auth: 'oauth'
          }
        })
      ).not.toThrow()
    })
  })

  describe('assertCredentialSafe', () => {
    it('throws for a credential header over plain http to a non-loopback host', () => {
      expect(() =>
        assertCredentialSafe(new URL('http://mcp.example.com/mcp'), { Authorization: 'Bearer tok' })
      ).toThrow('cleartext over http')
    })

    it('allows a credential header over http to a loopback host', () => {
      expect(() =>
        assertCredentialSafe(new URL('http://127.0.0.1:8080/mcp'), { Authorization: 'Bearer tok' })
      ).not.toThrow()
    })

    it('is a no-op when there are no headers', () => {
      expect(() => assertCredentialSafe(new URL('http://mcp.example.com/mcp'))).not.toThrow()
    })

    it('throws for oauth mode over plain http to a non-loopback host, even with no headers', () => {
      expect(() =>
        assertCredentialSafe(new URL('http://mcp.example.com/mcp'), undefined, true)
      ).toThrow('cleartext over http')
    })

    it('allows oauth mode over https', () => {
      expect(() =>
        assertCredentialSafe(new URL('https://mcp.example.com/mcp'), undefined, true)
      ).not.toThrow()
    })
  })
})
