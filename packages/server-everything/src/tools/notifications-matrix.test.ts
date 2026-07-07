import { describe, it, expect, afterEach } from 'vitest'
import { connectTestClient, type TestClient } from '../test/harness'

describe('notifications-matrix', () => {
  let testClient: TestClient

  afterEach(async () => {
    await testClient?.close()
  })

  it('registers with nested matrix schema for channels, quietHours, and routingRules', async () => {
    testClient = await connectTestClient()

    const { tools } = await testClient.client.listTools()
    const tool = tools.find((t) => t.name === 'notifications-matrix')

    expect(tool).toBeDefined()
    expect(tool?.inputSchema?.type).toBe('object')

    const properties = tool?.inputSchema?.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(['profileId', 'matrix', 'dryRun'])
    )

    const matrix = properties.matrix as {
      type?: string
      properties?: Record<string, unknown>
    }
    expect(matrix.type).toBe('object')
    expect(Object.keys(matrix.properties ?? {})).toEqual(
      expect.arrayContaining([
        'globalEnabled',
        'digestFrequency',
        'maxPerHour',
        'quietHours',
        'channels',
        'routingRules'
      ])
    )
  })

  it('accepts a full nested matrix and returns summary counts', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'notifications-matrix',
      arguments: {
        profileId: 'team-alpha',
        dryRun: false,
        matrix: {
          globalEnabled: true,
          digestFrequency: 'weekly',
          maxPerHour: 30,
          quietHours: {
            enabled: true,
            start: '23:00',
            end: '06:00',
            timezone: 'America/New_York',
            days: ['mon', 'tue', 'wed', 'thu', 'fri']
          },
          channels: [
            {
              type: 'email',
              target: 'alerts@example.com',
              enabled: true,
              severities: ['critical', 'high']
            },
            {
              type: 'webhook',
              target: 'https://hooks.example.com/notify',
              enabled: false,
              severities: ['critical']
            }
          ],
          routingRules: [
            {
              eventType: 'build.failed',
              channelTypes: ['email', 'webhook'],
              minSeverity: 'high'
            }
          ]
        }
      }
    })

    expect(result.isError).not.toBe(true)

    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Profile: team-alpha')
    expect(text).toContain('Dry run: false')
    expect(text).toContain('Channels: total=2, enabled=1')
    expect(text).toContain('Routing rules: 1')
    expect(text).toContain('Quiet hours: 23:00-06:00 America/New_York')
  })

  it('applies defaults for optional matrix fields', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'notifications-matrix',
      arguments: {
        profileId: 'defaults-check',
        matrix: {
          channels: [{ type: 'push', target: 'device:abc123' }]
        }
      }
    })

    expect(result.isError).not.toBe(true)

    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Dry run: true')
    expect(text).toContain('Digest: daily')
    expect(text).toContain('Max per hour: 100')
    expect(text).toContain('Quiet hours: disabled')
    expect(text).toContain('Routing rules: 0')
  })

  it('rejects invalid matrix payloads', async () => {
    testClient = await connectTestClient()

    const result = await testClient.client.callTool({
      name: 'notifications-matrix',
      arguments: {
        profileId: 'bad-payload',
        matrix: {
          channels: []
        }
      }
    })

    expect(result.isError).toBe(true)
  })
})
