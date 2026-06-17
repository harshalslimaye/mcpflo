import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptResultView, type PromptResultTab } from './PromptResultView'
import type { PromptGetRecord } from '../../stores/serverStore'

function record(over: Partial<PromptGetRecord> = {}): PromptGetRecord {
  return {
    id: 'p1',
    serverId: 'srv',
    promptName: 'summarize',
    args: { topic: 'mcp' },
    status: 'success',
    response: {
      jsonrpc: '2.0',
      result: {
        description: 'A summary prompt',
        messages: [
          { role: 'user', content: { type: 'text', text: 'Summarize mcp' } },
          { role: 'assistant', content: { type: 'text', text: 'Sure thing' } }
        ]
      }
    },
    durationMs: 5,
    at: Date.now(),
    ...over
  }
}

function renderView(
  rec: PromptGetRecord | undefined,
  tab: PromptResultTab = 'preview'
): { onTabChange: ReturnType<typeof vi.fn> } & ReturnType<typeof render> {
  const onTabChange = vi.fn()
  return {
    onTabChange,
    ...render(<PromptResultView record={rec} tab={tab} onTabChange={onTabChange} />)
  }
}

describe('PromptResultView — truncated response', () => {
  it('shows the size-limit notice instead of a transport-failure message', () => {
    renderView(record({ responseTruncated: true, response: undefined }), 'pretty')
    expect(screen.getByText(/exceeded the in-memory size limit/i)).toBeInTheDocument()
    expect(screen.queryByText('No response received.')).not.toBeInTheDocument()
  })
})

describe('PromptResultView', () => {
  it('offers Preview, Raw and Pretty tabs', () => {
    renderView(record())
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raw' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pretty' })).toBeInTheDocument()
  })

  it('shows a success status line with the duration', () => {
    renderView(record({ durationMs: 42 }))
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByText('42 ms')).toBeInTheDocument()
  })

  it('renders the description and each message with its role on the Preview tab', () => {
    renderView(record(), 'preview')
    expect(screen.getByText('A summary prompt')).toBeInTheDocument()
    expect(screen.getByText('user')).toBeInTheDocument()
    expect(screen.getByText('assistant')).toBeInTheDocument()
    expect(screen.getByText('Summarize mcp')).toBeInTheDocument()
    expect(screen.getByText('Sure thing')).toBeInTheDocument()
  })

  it('renders the full JSON-RPC envelope on the Raw tab', () => {
    const { container } = renderView(record(), 'raw')
    expect(container.textContent).toContain('jsonrpc')
    expect(container.textContent).toContain('messages')
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument()
  })

  it('renders the indented JSON-RPC envelope on the Pretty tab', () => {
    const { container } = renderView(record(), 'pretty')
    expect(container.querySelector('pre')?.textContent).toContain('\n  ')
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument()
  })

  it('calls onTabChange when a tab is clicked', () => {
    const { onTabChange } = renderView(record(), 'preview')
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    expect(onTabChange).toHaveBeenCalledWith('raw')
  })

  it('shows a no-messages message when the result has no messages', () => {
    const rec = record({ response: { jsonrpc: '2.0', result: { messages: [] } } })
    renderView(rec, 'preview')
    expect(screen.getByText('No messages returned.')).toBeInTheDocument()
  })

  it('shows the protocol error for a JSON-RPC error envelope', () => {
    const rec = record({
      status: 'error',
      response: { jsonrpc: '2.0', error: { code: -32602, message: 'Prompt not found' } }
    })
    renderView(rec, 'preview')
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText(/Prompt not found/)).toBeInTheDocument()
  })

  it('shows the transport error when no response arrived', () => {
    const rec = record({ status: 'error', response: undefined, error: 'connection refused' })
    renderView(rec, 'preview')
    expect(screen.getByText('connection refused')).toBeInTheDocument()
  })

  it('renders a Getting… state when no record is present', () => {
    renderView(undefined)
    // Shown both in the status line and the body placeholder.
    expect(screen.getAllByText('Getting…').length).toBeGreaterThan(0)
  })
})
