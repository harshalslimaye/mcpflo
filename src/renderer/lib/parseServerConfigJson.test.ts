import { describe, it, expect } from 'vitest'
import { parseServerConfigJson } from './parseServerConfigJson'

describe('parseServerConfigJson', () => {
  it('rejects invalid JSON', () => {
    const result = parseServerConfigJson('{not json', new Set())
    expect(result).toEqual({ ok: false, error: 'Invalid JSON' })
  })

  it('rejects a non-object top level', () => {
    const result = parseServerConfigJson('[1,2,3]', new Set())
    expect(result).toEqual({ ok: false, error: 'Expected a JSON object' })
  })

  it('parses a single mcpServers stdio entry', () => {
    const result = parseServerConfigJson(
      JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', 'pkg'] } } }),
      new Set()
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.configs).toHaveLength(1)
    expect(result.configs[0]).toMatchObject({
      name: 'github',
      transport: { type: 'stdio', command: 'npx', args: ['-y', 'pkg'] }
    })
    expect(result.configs[0].id).toBeDefined()
  })

  it('parses a single mcpServers http entry with headers', () => {
    const result = parseServerConfigJson(
      JSON.stringify({
        mcpServers: {
          slack: { url: 'https://slack.example.com/mcp', headers: { Authorization: 'Bearer x' } }
        }
      }),
      new Set()
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.configs[0]).toMatchObject({
      name: 'slack',
      transport: {
        type: 'streamable-http',
        url: 'https://slack.example.com/mcp',
        headers: { Authorization: 'Bearer x' }
      }
    })
  })

  it('parses multiple mcpServers entries', () => {
    const result = parseServerConfigJson(
      JSON.stringify({
        mcpServers: {
          github: { command: 'npx', args: ['-y', 'gh-server'] },
          slack: { url: 'https://slack.example.com/mcp' }
        }
      }),
      new Set()
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.configs.map((c) => c.name)).toEqual(['github', 'slack'])
  })

  it('parses a single bare entry with a name field', () => {
    const result = parseServerConfigJson(
      JSON.stringify({ name: 'My Server', command: 'node', env: { TOKEN: 'abc' } }),
      new Set()
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.configs[0]).toMatchObject({
      name: 'My Server',
      transport: { type: 'stdio', command: 'node', env: { TOKEN: 'abc' } }
    })
  })

  it('rejects a bare entry with no name', () => {
    const result = parseServerConfigJson(JSON.stringify({ command: 'node' }), new Set())
    expect(result).toEqual({
      ok: false,
      error: 'Provide a "name", or wrap the entry in "mcpServers"'
    })
  })

  it('rejects an entry with neither command nor url', () => {
    const result = parseServerConfigJson(
      JSON.stringify({ mcpServers: { broken: { foo: 'bar' } } }),
      new Set()
    )
    expect(result).toEqual({ ok: false, error: '"broken" must have either "command" or "url"' })
  })

  it('rejects args that are not an array of strings', () => {
    const result = parseServerConfigJson(
      JSON.stringify({ mcpServers: { bad: { command: 'npx', args: [1, 2] } } }),
      new Set()
    )
    expect(result).toEqual({ ok: false, error: '"bad": args must be an array of strings' })
  })

  it('rejects env that is not a string record', () => {
    const result = parseServerConfigJson(
      JSON.stringify({ mcpServers: { bad: { command: 'npx', env: { PORT: 3000 } } } }),
      new Set()
    )
    expect(result).toEqual({ ok: false, error: '"bad": env must be an object of string values' })
  })

  it('rejects a name colliding with an existing server', () => {
    const result = parseServerConfigJson(
      JSON.stringify({ mcpServers: { github: { command: 'npx' } } }),
      new Set(['github'])
    )
    expect(result).toEqual({ ok: false, error: 'A server named "github" already exists' })
  })

  it('rejects a name colliding with another entry in the same paste', () => {
    const result = parseServerConfigJson(
      JSON.stringify({
        mcpServers: {
          // Object keys are unique in valid JSON, but a duplicate after
          // trimming whitespace should still be caught.
          github: { command: 'npx' },
          ' github ': { command: 'node' }
        }
      }),
      new Set()
    )
    expect(result).toEqual({ ok: false, error: 'A server named "github" already exists' })
  })

  it('rejects an empty mcpServers object', () => {
    const result = parseServerConfigJson(JSON.stringify({ mcpServers: {} }), new Set())
    expect(result).toEqual({ ok: false, error: 'No servers found in "mcpServers"' })
  })

  it('rejects when mcpServers is not an object', () => {
    const result = parseServerConfigJson(JSON.stringify({ mcpServers: 'oops' }), new Set())
    expect(result).toEqual({ ok: false, error: '"mcpServers" must be an object' })
  })
})
