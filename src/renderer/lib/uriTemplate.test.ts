import { describe, it, expect } from 'vitest'
import { templateVariables, expandTemplate } from './uriTemplate'

// Helper: assert a successful expansion and return the uri, so the common case
// reads as one line without repeating the ok-narrowing dance.
function expanded(uriTemplate: string, values: Record<string, string>): string {
  const result = expandTemplate(uriTemplate, values)
  if (!result.ok) throw new Error(`expected an expansion, got: ${result.error}`)
  return result.uri
}

describe('templateVariables', () => {
  it('finds a single variable', () => {
    expect(templateVariables('mem://text/{id}')).toEqual(['id'])
  })

  it('finds several, in the order they appear', () => {
    expect(templateVariables('repo://{owner}/{repo}/tree')).toEqual(['owner', 'repo'])
  })

  it('reports a name that appears twice only once', () => {
    // One form field per name, not one per occurrence.
    expect(templateVariables('repo://{owner}/{owner}')).toEqual(['owner'])
  })

  it('reads the RFC operator forms', () => {
    expect(templateVariables('s://x{?query}')).toEqual(['query'])
    expect(templateVariables('s://{+path}')).toEqual(['path'])
    expect(templateVariables('s://{/segments*}')).toEqual(['segments'])
  })

  it('is empty for a template with no variables', () => {
    expect(templateVariables('mem://static')).toEqual([])
  })

  it('is empty for a malformed template rather than throwing', () => {
    // A server can send anything; an unclosed expression must not reach the UI
    // as an exception.
    expect(templateVariables('mem://{unclosed')).toEqual([])
  })
})

describe('expandTemplate', () => {
  it('substitutes a value', () => {
    expect(expanded('mem://text/{id}', { id: '7' })).toBe('mem://text/7')
  })

  it('substitutes several', () => {
    expect(expanded('repo://{owner}/{repo}/tree', { owner: 'octocat', repo: 'hello' })).toBe(
      'repo://octocat/hello/tree'
    )
  })

  it('fills every occurrence of a repeated name from one value', () => {
    expect(expanded('repo://{owner}/{owner}', { owner: 'octocat' })).toBe('repo://octocat/octocat')
  })

  it('passes a template with no variables through unchanged', () => {
    expect(expanded('mem://static', {})).toBe('mem://static')
  })

  it('ignores values the template never asked for', () => {
    expect(expanded('mem://text/{id}', { id: '7', unused: 'x' })).toBe('mem://text/7')
  })

  describe('encoding', () => {
    it('percent-encodes a space', () => {
      expect(expanded('mem://text/{id}', { id: 'a b' })).toBe('mem://text/a%20b')
    })

    it('escapes a slash in a plain variable, so it stays one path segment', () => {
      expect(expanded('mem://text/{id}', { id: 'a/b' })).toBe('mem://text/a%2Fb')
    })

    it('leaves a slash alone under the + operator, which means "reserved allowed"', () => {
      expect(expanded('s://{+path}', { path: 'a/b/c' })).toBe('s://a/b/c')
    })

    it('percent-encodes non-ASCII as UTF-8', () => {
      expect(expanded('mem://text/{id}', { id: 'né' })).toBe('mem://text/n%C3%A9')
    })

    it('builds a query string under the ? operator', () => {
      expect(expanded('s://x{?query}', { query: 'hello world' })).toBe('s://x?query=hello%20world')
    })

    it('adds the separator itself under the / operator, but not one from the value', () => {
      expect(expanded('files{/path*}', { path: 'docs' })).toBe('files/docs')
      // The operator contributes the slash; a slash inside the value is still
      // escaped, so a value can't invent extra path segments.
      expect(expanded('files{/path*}', { path: 'a/b' })).toBe('files/a%2Fb')
    })
  })

  describe('refuses to expand rather than producing a URI with a hole in it', () => {
    it('rejects a missing value', () => {
      const result = expandTemplate('mem://text/{id}', {})
      expect(result).toEqual({ ok: false, error: 'Missing a value for id' })
    })

    it('rejects an empty value, which would otherwise expand to a bare prefix', () => {
      // The SDK would happily produce "mem://text/" here — a valid URI, and not
      // what anyone meant to read.
      expect(expandTemplate('mem://text/{id}', { id: '' }).ok).toBe(false)
    })

    it('rejects a whitespace-only value', () => {
      expect(expandTemplate('mem://text/{id}', { id: '   ' }).ok).toBe(false)
    })

    it('keeps surrounding whitespace in a value that has other content', () => {
      // Trimming would silently change which resource gets read.
      expect(expanded('mem://text/{id}', { id: ' 7 ' })).toBe('mem://text/%207%20')
    })

    it('names every missing variable', () => {
      const result = expandTemplate('repo://{owner}/{repo}', { owner: 'octocat' })
      expect(result).toEqual({ ok: false, error: 'Missing a value for repo' })
    })

    it('names them all when several are missing', () => {
      const result = expandTemplate('repo://{owner}/{repo}', {})
      expect(result).toEqual({ ok: false, error: 'Missing values for owner, repo' })
    })

    it('reports a malformed template as an error rather than throwing', () => {
      const result = expandTemplate('mem://{unclosed', { unclosed: '7' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/unclosed/i)
    })
  })
})
