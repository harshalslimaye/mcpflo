import { describe, it, expect } from 'vitest'
import {
  parseTransportUrl,
  credentialOverHttp,
  findDuplicateKey,
  isLoopbackHost,
  isSensitiveHeaderKey
} from './transportValidation'

describe('parseTransportUrl', () => {
  it('accepts http and https URLs and returns the parsed URL', () => {
    const https = parseTransportUrl('https://mcp.example.com/mcp')
    expect('url' in https && https.url.protocol).toBe('https:')
    const http = parseTransportUrl('http://localhost:3000/mcp')
    expect('url' in http && http.url.protocol).toBe('http:')
  })

  it('rejects an unparseable string', () => {
    expect(parseTransportUrl('not a url')).toEqual({
      error: 'Enter a valid URL, e.g. https://mcp.example.com/mcp'
    })
  })

  it('rejects a non-http(s) scheme', () => {
    expect(parseTransportUrl('ftp://example.com')).toEqual({
      error: 'URL must start with http:// or https://'
    })
  })
})

describe('isLoopbackHost', () => {
  it('recognizes loopback hosts', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
  })

  it('rejects non-loopback hosts', () => {
    expect(isLoopbackHost('mcp.example.com')).toBe(false)
    expect(isLoopbackHost('10.0.0.5')).toBe(false)
  })
})

describe('isSensitiveHeaderKey', () => {
  it('flags credential-bearing header names case-insensitively', () => {
    expect(isSensitiveHeaderKey('Authorization')).toBe(true)
    expect(isSensitiveHeaderKey('x-api-key')).toBe(true)
    expect(isSensitiveHeaderKey('X-Auth-Token')).toBe(true)
    expect(isSensitiveHeaderKey('Cookie')).toBe(true)
  })

  it('does not flag ordinary headers', () => {
    expect(isSensitiveHeaderKey('X-Team')).toBe(false)
    expect(isSensitiveHeaderKey('Content-Type')).toBe(false)
  })
})

describe('credentialOverHttp', () => {
  it('flags a sensitive header over plain http to a remote host', () => {
    const { url } = parseTransportUrl('http://mcp.example.com/mcp') as { url: URL }
    expect(credentialOverHttp(url, ['Authorization'])).toContain('cleartext over http')
  })

  it('allows the same over https', () => {
    const { url } = parseTransportUrl('https://mcp.example.com/mcp') as { url: URL }
    expect(credentialOverHttp(url, ['Authorization'])).toBeUndefined()
  })

  it('allows http to a loopback host', () => {
    const { url } = parseTransportUrl('http://127.0.0.1:8080/mcp') as { url: URL }
    expect(credentialOverHttp(url, ['Authorization'])).toBeUndefined()
  })

  it('allows non-sensitive headers over http', () => {
    const { url } = parseTransportUrl('http://mcp.example.com/mcp') as { url: URL }
    expect(credentialOverHttp(url, ['X-Team'])).toBeUndefined()
  })
})

describe('findDuplicateKey', () => {
  it('finds a case-insensitive duplicate (HTTP headers)', () => {
    expect(findDuplicateKey(['Authorization', 'authorization'], true)).toBe('authorization')
  })

  it('treats case as distinct when case-sensitive (env vars)', () => {
    expect(findDuplicateKey(['PATH', 'path'], false)).toBeUndefined()
    expect(findDuplicateKey(['PATH', 'PATH'], false)).toBe('PATH')
  })

  it('ignores blank keys and returns undefined when unique', () => {
    expect(findDuplicateKey(['A', '', '  ', 'B'], true)).toBeUndefined()
  })
})
