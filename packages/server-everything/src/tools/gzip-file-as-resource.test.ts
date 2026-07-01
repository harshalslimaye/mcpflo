import { gunzipSync } from 'node:zlib'
import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

function dataUriFor(text: string): string {
  return `data:text/plain;base64,${Buffer.from(text).toString('base64')}`
}

describe('gzip-file-as-resource', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('returns a full resource block that decompresses to the original bytes', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'gzip-file-as-resource',
      arguments: { data: dataUriFor('hello mcpflo'), name: 'hello.txt.gz', outputType: 'resource' }
    })
    const blocks = result.content as Array<{ type: string; resource?: { blob: string; mimeType: string } }>
    expect(blocks[0].resource?.mimeType).toBe('application/gzip')
    const decompressed = gunzipSync(Buffer.from(blocks[0].resource?.blob as string, 'base64'))
    expect(decompressed.toString()).toBe('hello mcpflo')
  })

  it('returns a resource_link and registers it for later reading', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'gzip-file-as-resource',
      arguments: { data: dataUriFor('second file'), name: 'second.txt.gz', outputType: 'resourceLink' }
    })
    const blocks = result.content as Array<{ type: string; uri?: string }>
    expect(blocks[0].type).toBe('resource_link')

    const read = await testClient.client.readResource({ uri: blocks[0].uri as string })
    const decompressed = gunzipSync(Buffer.from(read.contents[0].blob as string, 'base64'))
    expect(decompressed.toString()).toBe('second file')
  })

  it('rejects an unsupported URL protocol', async () => {
    testClient = await connectTestClient()
    const result = await testClient.client.callTool({
      name: 'gzip-file-as-resource',
      arguments: { data: 'ftp://example.com/file' }
    })
    expect(result.isError).toBe(true)
  })
})
