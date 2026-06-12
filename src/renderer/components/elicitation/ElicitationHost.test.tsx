import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ElicitationHost } from './ElicitationHost'
import { useServerStore } from '../../stores/serverStore'
import type { ElicitationRequestEvent, ElicitationClosedEvent } from '../../../shared/mcp.types'

function event(elicitationId: string, message: string): ElicitationRequestEvent {
  return {
    callId: 'call-1',
    elicitationId,
    serverName: 'Test Server',
    toolName: 'ask_name',
    params: {
      message,
      requestedSchema: { type: 'object', properties: { name: { type: 'string' } } }
    }
  }
}

let emitRequest: (e: ElicitationRequestEvent) => void
let emitClosed: (e: ElicitationClosedEvent) => void

beforeEach(() => {
  vi.clearAllMocks()
  useServerStore.setState({ pendingElicitations: [] })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      mcp: {
        onElicitationRequest: (cb: typeof emitRequest): (() => void) => {
          emitRequest = cb
          return () => {}
        },
        onElicitationClosed: (cb: typeof emitClosed): (() => void) => {
          emitClosed = cb
          return () => {}
        },
        respondToElicitation: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
})

describe('ElicitationHost', () => {
  it('renders nothing while no elicitation is pending', () => {
    render(<ElicitationHost />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the oldest request first and the next one after it closes', () => {
    render(<ElicitationHost />)
    act(() => {
      emitRequest(event('elic-1', 'First question'))
      emitRequest(event('elic-2', 'Second question'))
    })
    expect(screen.getByText('First question')).toBeInTheDocument()
    expect(screen.queryByText('Second question')).not.toBeInTheDocument()

    act(() => {
      emitClosed({ elicitationId: 'elic-1' })
    })
    expect(screen.queryByText('First question')).not.toBeInTheDocument()
    expect(screen.getByText('Second question')).toBeInTheDocument()
  })

  it('ignores a close for an id that is not pending', () => {
    render(<ElicitationHost />)
    act(() => {
      emitRequest(event('elic-1', 'First question'))
      emitClosed({ elicitationId: 'elic-other' })
    })
    expect(screen.getByText('First question')).toBeInTheDocument()
  })
})
