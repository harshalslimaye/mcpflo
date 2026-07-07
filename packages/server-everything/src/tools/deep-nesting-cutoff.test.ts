import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('deep-nesting-cutoff', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('registers with deeply nested object and array containers', async () => {
    testClient = await connectTestClient()

    const { tools } = await testClient.client.listTools()
    const tool = tools.find((t) => t.name === 'deep-nesting-cutoff')

    expect(tool).toBeDefined()
    expect(tool?.inputSchema?.type).toBe('object')

    const props = tool?.inputSchema?.properties as Record<string, unknown>
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['profile', 'tree', 'strict']))

    const tree = props.tree as { properties?: Record<string, unknown> }
    const root = (tree.properties?.root ?? {}) as { properties?: Record<string, unknown> }
    const children = (root.properties?.children ?? {}) as {
      type?: string
      items?: { properties?: Record<string, unknown> }
    }

    expect(children.type).toBe('array')

    const childProps = (children.items?.properties ?? {}) as Record<string, unknown>
    const payload = (childProps.payload ?? {}) as { properties?: Record<string, unknown> }
    const config = (payload.properties?.config ?? {}) as { type?: string }
    expect(config.type).toBe('object')
  })

  it('accepts valid deep nested input and returns computed summary', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'deep-nesting-cutoff',
      arguments: {
        profile: 'stress-case-a',
        strict: true,
        tree: {
          root: {
            children: [
              {
                id: 'node-1',
                payload: {
                  depthMarker: 4,
                  config: {}
                }
              },
              {
                id: 'node-2',
                payload: {
                  depthMarker: 7,
                  config: {
                    retries: 5,
                    labels: ['a', 'b']
                  }
                }
              }
            ]
          }
        }
      }
    })

    expect(result.isError).not.toBe(true)
    const text = (result.content as Array<{ text: string }>)[0].text

    expect(text).toContain('Profile: stress-case-a')
    expect(text).toContain('Strict mode: true')
    expect(text).toContain('Child count: 2')
    expect(text).toContain('Max depth marker: 7')
    expect(text).toContain('Child ids: node-1, node-2')
  })

  it('applies defaults when optional top-level fields are omitted', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'deep-nesting-cutoff',
      arguments: {
        tree: {
          root: {
            children: [
              {
                id: 'node-defaults',
                payload: {
                  depthMarker: 1,
                  config: {}
                }
              }
            ]
          }
        }
      }
    })

    expect(result.isError).not.toBe(true)
    const text = (result.content as Array<{ text: string }>)[0].text

    expect(text).toContain('Profile: default-profile')
    expect(text).toContain('Strict mode: false')
    expect(text).toContain('Root name: root-node')
  })

  it('rejects invalid nesting payloads that violate min child requirement', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'deep-nesting-cutoff',
      arguments: {
        tree: {
          root: {
            children: []
          }
        }
      }
    })

    expect(result.isError).toBe(true)
  })
})
