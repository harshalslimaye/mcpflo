import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResourceDetailView } from './ResourceDetailView'
import { useServerStore, resourceKey, type ResourceReadRecord } from '../../stores/serverStore'
import type { Resource } from '../../../shared/mcp.types'

const resource: Resource = {
  uri: 'demo://docs/architecture.md',
  name: 'architecture.md',
  description: 'Static document file',
  mimeType: 'text/markdown'
}

const mockReadResource = vi.fn()

function renderView(r: Resource = resource): ReturnType<typeof render> {
  return render(<ResourceDetailView resource={r} serverId="srv" serverName="Everything" />)
}

function successRecord(over: Partial<ResourceReadRecord> = {}): ResourceReadRecord {
  return {
    id: '1',
    serverId: 'srv',
    uri: resource.uri,
    status: 'success',
    response: {
      jsonrpc: '2.0',
      result: { contents: [{ uri: resource.uri, mimeType: 'text/markdown', text: '# Title' }] }
    },
    durationMs: 8,
    at: Date.now(),
    ...over
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockReadResource.mockResolvedValue(undefined)
  useServerStore.setState({ resourceHistory: {}, readResource: mockReadResource })
})

describe('ResourceDetailView', () => {
  it('renders the header with name, server and mimeType', () => {
    renderView()
    expect(screen.getByText('architecture.md')).toBeInTheDocument()
    expect(screen.getByText('Everything')).toBeInTheDocument()
    expect(screen.getByText('text/markdown')).toBeInTheDocument()
    expect(screen.getByText('Static document file')).toBeInTheDocument()
  })

  it('shows the uri in a disabled, read-only field', () => {
    renderView()
    const uri = screen.getByRole('textbox', { name: 'Resource URI' }) as HTMLInputElement
    expect(uri).toBeDisabled()
    expect(uri).toHaveAttribute('readonly')
    expect(uri.value).toBe('demo://docs/architecture.md')
  })

  it('falls back to the uri as the title when the resource has no name', () => {
    renderView({ uri: 'demo://unnamed' })
    // Appears as both the title and the disabled uri field value.
    expect(screen.getAllByText('demo://unnamed').length).toBeGreaterThan(0)
  })

  it('calls readResource with the server id and uri when Read is clicked', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(mockReadResource).toHaveBeenCalledWith('srv', 'demo://docs/architecture.md')
  })

  it('shows a Reading… state while a read is in flight', () => {
    mockReadResource.mockReturnValue(new Promise(() => {})) // never resolves
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(screen.getByRole('button', { name: 'Reading…' })).toBeDisabled()
  })

  it('renders the latest read result, defaulting to the Preview tab', () => {
    useServerStore.setState({
      resourceHistory: { [resourceKey('srv', resource.uri)]: [successRecord()] }
    })
    renderView()
    // The status chip shows in the minimized header; expand to see the body.
    expect(screen.getByText('Success')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand response'))
    expect(screen.getByText('# Title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' }).className).toContain('text-accent')
  })

  it('shows the selected read’s content when a History entry is clicked', () => {
    const newest = successRecord({
      id: 'new',
      durationMs: 11,
      response: {
        jsonrpc: '2.0',
        result: { contents: [{ uri: resource.uri, mimeType: 'text/markdown', text: '# NEWEST' }] }
      }
    })
    const older = successRecord({
      id: 'old',
      durationMs: 22,
      response: {
        jsonrpc: '2.0',
        result: { contents: [{ uri: resource.uri, mimeType: 'text/markdown', text: '# OLDEST' }] }
      }
    })
    useServerStore.setState({
      resourceHistory: { [resourceKey('srv', resource.uri)]: [newest, older] }
    })
    renderView()
    // Minimized by default — expand to reveal the latest read…
    fireEvent.click(screen.getByLabelText('Expand response'))
    expect(screen.getByText('# NEWEST')).toBeInTheDocument()
    // …clicking the older entry (22 ms) swaps the panel to its content.
    fireEvent.click(screen.getByText('22 ms'))
    expect(screen.getByText('# OLDEST')).toBeInTheDocument()
    expect(screen.queryByText('# NEWEST')).not.toBeInTheDocument()
  })

  it('renders an error result from history', () => {
    const record = successRecord({
      status: 'error',
      response: undefined,
      error: 'connection refused'
    })
    useServerStore.setState({
      resourceHistory: { [resourceKey('srv', resource.uri)]: [record] }
    })
    renderView()
    // The error chip shows in the minimized header; expand to see the detail.
    expect(screen.getByText('Error')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand response'))
    expect(screen.getByText('connection refused')).toBeInTheDocument()
  })

  it('shows an empty history message when there are no reads', () => {
    renderView()
    expect(screen.getByText('No reads yet.')).toBeInTheDocument()
  })

  it('shows a minimized idle dock before any read', () => {
    renderView()
    // The dock is always present but minimized: header + Idle, body hidden.
    expect(screen.getByText('Response')).toBeInTheDocument()
    expect(screen.getByText('Idle')).toBeInTheDocument()
    expect(screen.queryByText('Read the resource to see its contents.')).not.toBeInTheDocument()
  })

  it('clears the read history when clear is clicked', () => {
    useServerStore.setState({
      resourceHistory: { [resourceKey('srv', resource.uri)]: [successRecord()] }
    })
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByText('No reads yet.')).toBeInTheDocument()
  })
})
