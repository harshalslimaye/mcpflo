import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResourceContentView, type ResourceResultTab } from './ResourceContentView'
import type { ResourceReadRecord } from '../../stores/serverStore'

function record(over: Partial<ResourceReadRecord> = {}): ResourceReadRecord {
  return {
    id: 'r1',
    serverId: 'srv',
    uri: 'demo://x',
    status: 'success',
    response: {
      jsonrpc: '2.0',
      result: { contents: [{ uri: 'demo://x', mimeType: 'text/plain', text: 'hello world' }] }
    },
    durationMs: 5,
    at: Date.now(),
    ...over
  }
}

function renderView(
  rec: ResourceReadRecord | undefined,
  tab: ResourceResultTab = 'preview'
): { onTabChange: ReturnType<typeof vi.fn> } & ReturnType<typeof render> {
  const onTabChange = vi.fn()
  return {
    onTabChange,
    ...render(<ResourceContentView record={rec} tab={tab} onTabChange={onTabChange} />)
  }
}

describe('ResourceContentView — truncated response', () => {
  it('shows the size-limit notice instead of a transport-failure message', () => {
    renderView(record({ responseTruncated: true, response: undefined }), 'pretty')
    expect(screen.getByText(/exceeded the in-memory size limit/i)).toBeInTheDocument()
    expect(screen.queryByText('No response received.')).not.toBeInTheDocument()
  })
})

describe('ResourceContentView', () => {
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

  it('renders text content with its mimeType on the Preview tab', () => {
    renderView(record(), 'preview')
    expect(screen.getByText('hello world')).toBeInTheDocument()
    expect(screen.getByText('text/plain')).toBeInTheDocument()
  })

  it('renders the full JSON-RPC envelope on the Raw tab', () => {
    const { container } = renderView(record(), 'raw')
    expect(container.textContent).toContain('jsonrpc')
    expect(container.textContent).toContain('contents')
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument()
  })

  it('renders an error envelope verbatim on the Raw tab', () => {
    const rec = record({
      status: 'error',
      response: { jsonrpc: '2.0', error: { code: -32602, message: 'Resource not found' } }
    })
    const { container } = renderView(rec, 'raw')
    expect(container.textContent).toContain('Resource not found')
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument()
  })

  it('renders the indented JSON-RPC envelope on the Pretty tab', () => {
    const { container } = renderView(record(), 'pretty')
    expect(container.textContent).toContain('jsonrpc')
    expect(container.textContent).toContain('contents')
    // Indented with 2 spaces (vs. the compact Raw form).
    expect(container.querySelector('pre')?.textContent).toContain('\n  ')
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument()
  })

  it('calls onTabChange when a tab is clicked', () => {
    const { onTabChange } = renderView(record(), 'preview')
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    expect(onTabChange).toHaveBeenCalledWith('raw')
  })

  it('renders an image resource as an <img> on the Preview tab', () => {
    const rec = record({
      response: {
        jsonrpc: '2.0',
        result: { contents: [{ uri: 'demo://img', mimeType: 'image/png', blob: 'AAAA' }] }
      }
    })
    renderView(rec, 'preview')
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toBe('data:image/png;base64,AAAA')
  })

  it('summarizes a non-image binary blob by size on the Preview tab', () => {
    const rec = record({
      response: {
        jsonrpc: '2.0',
        result: {
          contents: [{ uri: 'demo://bin', mimeType: 'application/octet-stream', blob: 'AAAA' }]
        }
      }
    })
    renderView(rec, 'preview')
    expect(screen.getByText(/Binary resource/)).toBeInTheDocument()
  })

  it('shows a no-content message when the result has no entries', () => {
    const rec = record({ response: { jsonrpc: '2.0', result: { contents: [] } } })
    renderView(rec, 'preview')
    expect(screen.getByText('No content returned.')).toBeInTheDocument()
  })

  it('shows the protocol error for a JSON-RPC error envelope', () => {
    const rec = record({
      status: 'error',
      response: { jsonrpc: '2.0', error: { code: -32602, message: 'Resource not found' } }
    })
    renderView(rec, 'preview')
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText(/Resource not found/)).toBeInTheDocument()
  })

  it('shows the transport error when no response arrived', () => {
    const rec = record({ status: 'error', response: undefined, error: 'connection refused' })
    renderView(rec, 'preview')
    expect(screen.getByText('connection refused')).toBeInTheDocument()
  })

  it('renders a Reading… state when no record is present', () => {
    renderView(undefined)
    // Shown both in the status line and the body placeholder.
    expect(screen.getAllByText('Reading…').length).toBeGreaterThan(0)
  })
})
