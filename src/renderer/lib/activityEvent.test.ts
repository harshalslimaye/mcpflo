import { describe, it, expect } from 'vitest'
import {
  mergeActivity,
  toolCallToActivity,
  resourceReadToActivity,
  promptGetToActivity,
  protocolToActivity,
  type ProtocolEvent
} from './activityEvent'
import type { ToolCallRecord, ResourceReadRecord, PromptGetRecord } from '../stores/serverStore'

function toolRec(over: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: 't1',
    serverId: 's1',
    toolName: 'echo',
    args: { message: 'hi' },
    status: 'success',
    notifications: [],
    durationMs: 5,
    at: 1000,
    ...over
  }
}

function resourceRec(over: Partial<ResourceReadRecord> = {}): ResourceReadRecord {
  return {
    id: 'r1',
    serverId: 's1',
    uri: 'mem://x',
    status: 'success',
    durationMs: 7,
    at: 2000,
    ...over
  }
}

function promptRec(over: Partial<PromptGetRecord> = {}): PromptGetRecord {
  return {
    id: 'p1',
    serverId: 's1',
    promptName: 'summarize',
    args: {},
    status: 'success',
    durationMs: 9,
    at: 3000,
    ...over
  }
}

function protoEvent(over: Partial<ProtocolEvent> = {}): ProtocolEvent {
  return {
    id: 'c1',
    kind: 'connect',
    serverId: 's1',
    serverName: 'Demo',
    status: 'success',
    detail: 'initialized',
    source: 'live',
    durationMs: 12,
    at: 4000,
    ...over
  }
}

describe('activity event mappers', () => {
  it('projects a tool call with an args summary and a tool target', () => {
    const event = toolCallToActivity(toolRec())
    expect(event.kind).toBe('tool-call')
    expect(event.label).toBe('echo')
    expect(event.detail).toBe('{"message":"hi"}')
    expect(event.target).toEqual({ kind: 'tool', serverId: 's1', toolName: 'echo' })
    // The raw args ride along so an "All"-tab click can re-fill the form.
    expect(event.args).toEqual({ message: 'hi' })
  })

  it('summarizes empty args as "no arguments"', () => {
    expect(toolCallToActivity(toolRec({ args: {} })).detail).toBe('no arguments')
  })

  it('projects a resource read with the uri as label and a resource target', () => {
    const event = resourceReadToActivity(resourceRec())
    expect(event.kind).toBe('resource-read')
    expect(event.label).toBe('mem://x')
    expect(event.target).toEqual({ kind: 'resource', serverId: 's1', uri: 'mem://x' })
  })

  it('projects a prompt get with a prompt target', () => {
    const event = promptGetToActivity(promptRec())
    expect(event.kind).toBe('prompt-get')
    expect(event.label).toBe('summarize')
    expect(event.target).toEqual({ kind: 'prompt', serverId: 's1', promptName: 'summarize' })
  })

  it('projects a protocol event with the server name as label and no target', () => {
    const event = protocolToActivity(protoEvent({ kind: 'list-tools', detail: '5 tools' }))
    expect(event.kind).toBe('list-tools')
    expect(event.label).toBe('Demo')
    expect(event.detail).toBe('5 tools')
    expect(event.target).toBeUndefined()
  })

  it('carries the cache source through so the row can be badged', () => {
    expect(protocolToActivity(protoEvent({ source: 'cache' })).source).toBe('cache')
  })
})

describe('mergeActivity', () => {
  it('merges every source into one newest-first list', () => {
    const merged = mergeActivity(
      { 's1::echo': [toolRec({ at: 1000 })] },
      { 's1::mem://x': [resourceRec({ at: 2000 })] },
      { 's1::summarize': [promptRec({ at: 3000 })] },
      [protoEvent({ at: 4000 })]
    )
    expect(merged.map((e) => e.at)).toEqual([4000, 3000, 2000, 1000])
    expect(merged.map((e) => e.kind)).toEqual([
      'connect',
      'prompt-get',
      'resource-read',
      'tool-call'
    ])
  })

  it('flattens multiple records across multiple keys', () => {
    const merged = mergeActivity(
      {
        's1::echo': [toolRec({ id: 'a', at: 10 }), toolRec({ id: 'b', at: 30 })],
        's1::sum': [toolRec({ id: 'c', toolName: 'sum', at: 20 })]
      },
      {},
      {},
      []
    )
    expect(merged.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('returns an empty list when there is no activity', () => {
    expect(mergeActivity({}, {}, {}, [])).toEqual([])
  })
})
