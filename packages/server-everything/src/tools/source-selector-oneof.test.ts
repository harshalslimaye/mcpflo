import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('source-selector-oneof', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('registers and exposes a discriminated union schema for source', async () => {
    testClient = await connectTestClient()

    const { tools } = await testClient.client.listTools()
    const tool = tools.find((t) => t.name === 'source-selector-oneof')

    expect(tool).toBeDefined()
    expect(tool?.inputSchema?.type).toBe('object')

    const properties = tool?.inputSchema?.properties as Record<string, unknown>
    expect(properties.source).toBeDefined()

    const sourceSchema = properties.source as {
      oneOf?: Array<{ properties?: Record<string, unknown> }>
      anyOf?: Array<{ properties?: Record<string, unknown> }>
    }

    const branches = sourceSchema.oneOf ?? sourceSchema.anyOf ?? []
    expect(branches).toHaveLength(3)

    const discriminators = branches
      .map((branch) => branch.properties?.sourceType)
      .filter(Boolean)
    expect(discriminators.length).toBe(3)
  })

  it('accepts the git branch and returns branch-specific summary', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'source-selector-oneof',
      arguments: {
        source: {
          sourceType: 'git',
          repoUrl: 'https://github.com/modelcontextprotocol/servers.git',
          ref: 'main',
          shallow: true
        },
        includeGlobs: ['src/**', 'README.md'],
        maxFiles: 50
      }
    })

    expect(result.isError).not.toBe(true)

    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Source branch: git')
    expect(text).toContain('repo=https://github.com/modelcontextprotocol/servers.git')
    expect(text).toContain('Include globs: src/**, README.md')
    expect(text).toContain('Max files: 50')
  })

  it('accepts the url branch and uses defaults for optional fields', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'source-selector-oneof',
      arguments: {
        source: {
          sourceType: 'url',
          url: 'https://example.com/archive.json'
        }
      }
    })

    expect(result.isError).not.toBe(true)
    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Source branch: url')
    expect(text).toContain('followRedirects=true')
    expect(text).toContain('Max files: 200')
  })

  it('rejects invalid source branch payloads', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'source-selector-oneof',
      arguments: {
        source: {
          sourceType: 'git'
        }
      }
    })

    expect(result.isError).toBe(true)
  })
})
