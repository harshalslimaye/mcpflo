import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useActivityLog } from './useActivityLog'
import { useServerStore, resourceKey, type ResourceReadRecord } from '../../stores/serverStore'

function read(over: Partial<ResourceReadRecord> = {}): ResourceReadRecord {
  return {
    id: 'r1',
    serverId: 'srv',
    uri: 'mem://x',
    status: 'success',
    durationMs: 3,
    at: 1000,
    ...over
  }
}

beforeEach(() => {
  useServerStore.setState({
    history: {},
    resourceHistory: {},
    promptHistory: {},
    protocolEvents: [],
    selectedServerId: null,
    selectedTool: null,
    selectedResource: null,
    selectedResourceTemplate: null,
    selectedPrompt: null,
    pendingPrefill: null
  })
})

describe('useActivityLog — navigateTo', () => {
  it('selects the resource for a plain read', () => {
    useServerStore.setState({ resourceHistory: { [resourceKey('srv', 'mem://x')]: [read()] } })
    const { result } = renderHook(() => useActivityLog())
    act(() => result.current.navigateTo(result.current.events[0]))
    expect(useServerStore.getState().selectedResource).toEqual({
      serverId: 'srv',
      uri: 'mem://x'
    })
    expect(useServerStore.getState().pendingPrefill).toBeNull()
  })

  it('selects the template — not a resource — for a template read, and hands off its values', () => {
    const template = 'mem://text/{id}'
    useServerStore.setState({
      resourceHistory: {
        [resourceKey('srv', template)]: [
          read({ uri: template, expandedUri: 'mem://text/7', args: { id: '7' } })
        ]
      }
    })
    const { result } = renderHook(() => useActivityLog())
    act(() => result.current.navigateTo(result.current.events[0]))

    expect(useServerStore.getState().selectedResourceTemplate).toEqual({
      serverId: 'srv',
      uriTemplate: template
    })
    // Selecting a resource here would look for one whose uri is a template.
    expect(useServerStore.getState().selectedResource).toBeNull()
    expect(useServerStore.getState().pendingPrefill).toMatchObject({
      serverId: 'srv',
      name: template,
      args: { id: '7' }
    })
  })

  it('navigates a failed-expansion row to its template rather than nowhere', () => {
    // This row has no expandedUri — the read never got one. Discriminating on
    // that field sent it to selectResource(serverId, template), which matches
    // no resource, leaving the canvas on the empty state with nothing clicked.
    const template = 'mem://text/{id}'
    useServerStore.setState({
      resourceHistory: {
        [resourceKey('srv', template)]: [
          read({
            uri: template,
            status: 'error',
            error: 'Missing a value for id',
            args: { id: '' }
          })
        ]
      }
    })
    const { result } = renderHook(() => useActivityLog())
    act(() => result.current.navigateTo(result.current.events[0]))

    expect(useServerStore.getState().selectedResourceTemplate).toEqual({
      serverId: 'srv',
      uriTemplate: template
    })
    expect(useServerStore.getState().selectedResource).toBeNull()
  })
})
