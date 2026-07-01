import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

const DOC_NAMES = [
  'architecture.md',
  'extension.md',
  'features.md',
  'how-it-works.md',
  'instructions.md',
  'startup.md',
  'structure.md'
]

describe('file-resources', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('lists exactly the seven docs, each as text/markdown', async () => {
    testClient = await connectTestClient()
    const { resources } = await testClient.client.listResources()
    expect(resources.map((r) => r.name).sort()).toEqual([...DOC_NAMES].sort())
    expect(resources.every((r) => r.mimeType === 'text/markdown')).toBe(true)
  })

  it('reads back real, non-empty content for each doc', async () => {
    testClient = await connectTestClient()
    for (const name of DOC_NAMES) {
      const result = await testClient.client.readResource({ uri: `mcpflo://static/document/${name}` })
      const text = result.contents[0].text as string
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toContain('Error reading file')
    }
  })
})
