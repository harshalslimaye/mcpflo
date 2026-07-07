import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('complex-profile-intake', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('registers a nested object/array input schema', async () => {
    testClient = await connectTestClient()

    const { tools } = await testClient.client.listTools()
    const tool = tools.find((t) => t.name === 'complex-profile-intake')

    expect(tool).toBeDefined()
    expect(tool?.inputSchema?.type).toBe('object')

    const properties = tool?.inputSchema?.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        'fullName',
        'age',
        'primaryRole',
        'acceptTerms',
        'bio',
        'notes',
        'contactMethods',
        'preferences'
      ])
    )

    const contactMethods = properties.contactMethods as {
      type: string
      items: { type: string; properties: Record<string, unknown> }
    }
    expect(contactMethods.type).toBe('array')
    expect(contactMethods.items.type).toBe('object')
    expect(Object.keys(contactMethods.items.properties)).toEqual(
      expect.arrayContaining(['kind', 'value', 'isPrimary'])
    )

    const preferences = properties.preferences as { type: string; properties: Record<string, unknown> }
    expect(preferences.type).toBe('object')
    expect(Object.keys(preferences.properties)).toEqual(
      expect.arrayContaining(['theme', 'notifications', 'weeklyHours', 'favoriteNumbers'])
    )
  })

  it('accepts valid nested profile input and returns a summary', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'complex-profile-intake',
      arguments: {
        fullName: 'Ada Lovelace',
        age: 36,
        primaryRole: 'engineer',
        acceptTerms: true,
        bio: 'Pioneer in computing',
        notes: 'Prefers email for async updates.',
        contactMethods: [
          { kind: 'email', value: 'ada@example.com', isPrimary: true },
          { kind: 'slack', value: '@ada' }
        ],
        preferences: {
          theme: 'dark',
          notifications: true,
          weeklyHours: 35,
          favoriteNumbers: [3, 7, 11]
        }
      }
    })

    expect(result.isError).not.toBe(true)

    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Profile: Ada Lovelace (36)')
    expect(text).toContain('Primary contact: email=ada@example.com')
    expect(text).toContain('Favorite numbers: 3, 7, 11')
  })

  it('rejects invalid values for nested constraints', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'complex-profile-intake',
      arguments: {
        fullName: 'Test User',
        age: 10,
        primaryRole: 'engineer',
        acceptTerms: true,
        contactMethods: [],
        preferences: {
          theme: 'dark',
          notifications: true,
          weeklyHours: 20
        }
      }
    })

    expect(result.isError).toBe(true)
  })
})
