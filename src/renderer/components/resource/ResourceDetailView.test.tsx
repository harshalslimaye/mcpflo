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
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByText('# Title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' }).className).toContain('text-accent')
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
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('connection refused')).toBeInTheDocument()
  })

  it('shows an empty history message when there are no reads', () => {
    renderView()
    expect(screen.getByText('No reads yet.')).toBeInTheDocument()
  })

  it('hides the result panel until a read has happened', () => {
    renderView()
    expect(screen.queryByText('Response')).not.toBeInTheDocument()
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
