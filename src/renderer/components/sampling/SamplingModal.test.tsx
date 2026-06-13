import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SamplingModal } from './SamplingModal'
import { useServerStore } from '../../stores/serverStore'
import type { SamplingRequestEvent } from '../../../shared/mcp.types'

function request(params: Partial<SamplingRequestEvent['params']> = {}): SamplingRequestEvent {
  return {
    callId: 'call-1',
    samplingId: 'samp-1',
    serverName: 'Test Server',
    toolName: 'summarize',
    params: {
      messages: [{ role: 'user', content: { type: 'text', text: 'Summarize this.' } }],
      systemPrompt: 'You are terse.',
      maxTokens: 100,
      ...params
    }
  }
}

const mockRespond = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockRespond.mockResolvedValue(undefined)
  useServerStore.setState({ respondToSampling: mockRespond })
})

describe('SamplingModal — rendering', () => {
  it('shows the system prompt, conversation, and server/tool context', () => {
    render(<SamplingModal request={request()} />)
    expect(screen.getByText('You are terse.')).toBeInTheDocument()
    expect(screen.getByText('Summarize this.')).toBeInTheDocument()
    expect(screen.getByText('Test Server · during summarize')).toBeInTheDocument()
  })

  it('renders non-text content blocks as raw JSON', () => {
    const req = request({
      messages: [{ role: 'user', content: { type: 'image', data: 'AAAA', mimeType: 'image/png' } }]
    })
    render(<SamplingModal request={req} />)
    expect(screen.getByText(/"type":"image"/)).toBeInTheDocument()
  })
})

describe('SamplingModal — responses', () => {
  it('accepts with the typed reply, model, and stop reason', () => {
    render(<SamplingModal request={request()} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Assistant reply' }), {
      target: { value: 'A short summary.' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Model' }), {
      target: { value: 'gpt-test' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(mockRespond).toHaveBeenCalledWith('samp-1', {
      action: 'accept',
      content: { type: 'text', text: 'A short summary.' },
      model: 'gpt-test',
      stopReason: 'endTurn'
    })
  })

  it('falls back to the default model when the field is blank', () => {
    render(<SamplingModal request={request()} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Model' }), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(mockRespond).toHaveBeenCalledWith(
      'samp-1',
      expect.objectContaining({ model: 'mcpflo-manual' })
    )
  })

  it('omits the stop reason when cleared', () => {
    render(<SamplingModal request={request()} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Stop reason' }), {
      target: { value: '' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(mockRespond).toHaveBeenCalledWith(
      'samp-1',
      expect.objectContaining({ stopReason: undefined })
    )
  })

  it('declines without an assistant turn', () => {
    render(<SamplingModal request={request()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(mockRespond).toHaveBeenCalledWith('samp-1', { action: 'decline' })
  })

  it('cancels via the Cancel button', () => {
    render(<SamplingModal request={request()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockRespond).toHaveBeenCalledWith('samp-1', { action: 'cancel' })
  })

  it('cancels on Escape', () => {
    render(<SamplingModal request={request()} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockRespond).toHaveBeenCalledWith('samp-1', { action: 'cancel' })
  })

  it('responds at most once', () => {
    render(<SamplingModal request={request()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockRespond).toHaveBeenCalledTimes(1)
  })
})
