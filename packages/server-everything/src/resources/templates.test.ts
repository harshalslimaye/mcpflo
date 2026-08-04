import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('resource templates', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('lists the dynamic text and blob templates', async () => {
    testClient = await connectTestClient()
    const { resourceTemplates } = await testClient.client.listResourceTemplates()
    expect(resourceTemplates.map((t) => t.uriTemplate).sort()).toEqual(
      ['mcpflo://dynamic/blob/{resourceId}', 'mcpflo://dynamic/text/{resourceId}'].sort()
    )
  })

  it('excludes dynamic templates from resources/list', async () => {
    testClient = await connectTestClient()
    const { resources } = await testClient.client.listResources()
    expect(resources.some((r) => r.uri.startsWith('mcpflo://dynamic/'))).toBe(false)
  })

  it('generates fresh text content per read, with the correct resourceId', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.readResource({ uri: 'mcpflo://dynamic/text/5' })
    expect(result.contents[0].mimeType).toBe('text/plain')
    expect(result.contents[0].text).toContain('Resource 5:')
  })

  it('generates blob content with the correct binary mime type', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.readResource({ uri: 'mcpflo://dynamic/blob/7' })
    expect(result.contents[0].mimeType).toBe('application/octet-stream')
    const decoded = Buffer.from(result.contents[0].blob as string, 'base64').toString()
    expect(decoded).toContain('Resource 7:')
  })

  it('rejects a non-positive resourceId', async () => {
    testClient = await connectTestClient()
    await expect(testClient.client.readResource({ uri: 'mcpflo://dynamic/text/abc' })).rejects.toThrow()
  })

  describe('resourceId completion', () => {
    const complete = async (value: string): Promise<string[]> => {
      const result = await testClient.client.complete({
        ref: { type: 'ref/resource', uri: 'mcpflo://dynamic/text/{resourceId}' },
        argument: { name: 'resourceId', value }
      })
      return result.completion.values
    }

    it('offers every id it has when nothing has been typed', async () => {
      testClient = await connectTestClient()
      expect(await complete('')).toEqual(['1', '2', '3', '4', '5'])
    })

    it('narrows to the ids matching what has been typed', async () => {
      testClient = await connectTestClient()
      expect(await complete('3')).toEqual(['3'])
    })

    it('suggests nothing for an id it does not have', async () => {
      // Previously any positive integer was echoed straight back, so "7"
      // suggested "7" — a completion for a resource that doesn't exist.
      testClient = await connectTestClient()
      expect(await complete('7')).toEqual([])
    })

    it('suggests nothing for a non-numeric value', async () => {
      testClient = await connectTestClient()
      expect(await complete('abc')).toEqual([])
    })
  })
})
