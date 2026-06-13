import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SamplingHost } from './SamplingHost'
import { useServerStore } from '../../stores/serverStore'
import type { SamplingRequestEvent, SamplingClosedEvent } from '../../../shared/mcp.types'

function event(samplingId: string, text: string): SamplingRequestEvent {
  return {
    callId: 'call-1',
    samplingId,
    serverName: 'Test Server',
    toolName: 'summarize',
    params: {
      messages: [{ role: 'user', content: { type: 'text', text } }],
      maxTokens: 100
    }
  }
}

let emitRequest: (e: SamplingRequestEvent) => void
let emitClosed: (e: SamplingClosedEvent) => void

beforeEach(() => {
  vi.clearAllMocks()
  useServerStore.setState({ pendingSamplings: [] })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      mcp: {
        onSamplingRequest: (cb: typeof emitRequest): (() => void) => {
          emitRequest = cb
          return () => {}
        },
        onSamplingClosed: (cb: typeof emitClosed): (() => void) => {
          emitClosed = cb
          return () => {}
        },
        respondToSampling: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
})

describe('SamplingHost', () => {
  it('renders nothing while no sampling is pending', () => {
    render(<SamplingHost />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the oldest request first and the next one after it closes', () => {
    render(<SamplingHost />)
    act(() => {
      emitRequest(event('samp-1', 'First prompt'))
      emitRequest(event('samp-2', 'Second prompt'))
    })
    expect(screen.getByText('First prompt')).toBeInTheDocument()
    expect(screen.queryByText('Second prompt')).not.toBeInTheDocument()

    act(() => {
      emitClosed({ samplingId: 'samp-1' })
    })
    expect(screen.queryByText('First prompt')).not.toBeInTheDocument()
    expect(screen.getByText('Second prompt')).toBeInTheDocument()
  })

  it('ignores a close for an id that is not pending', () => {
    render(<SamplingHost />)
    act(() => {
      emitRequest(event('samp-1', 'First prompt'))
      emitClosed({ samplingId: 'samp-other' })
    })
    expect(screen.getByText('First prompt')).toBeInTheDocument()
  })
})
