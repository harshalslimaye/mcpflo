import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddServerModal } from './AddServerModal'
import { useServerStore } from '../../stores/serverStore'

const mockAddServer = vi.fn()
const mockOnClose = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useServerStore.setState({ servers: [], selectedServerId: null, addServer: mockAddServer })
  mockAddServer.mockResolvedValue(undefined)
})

function renderModal(): ReturnType<typeof render> {
  return render(<AddServerModal onClose={mockOnClose} />)
}

describe('AddServerModal', () => {
  it('renders modal title', () => {
    renderModal()
    expect(screen.getByText('Add MCP Server')).toBeInTheDocument()
  })

  it('renders name field', () => {
    renderModal()
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })

  it('renders description field', () => {
    renderModal()
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument()
  })

  it('defaults to stdio transport', () => {
    renderModal()
    expect(screen.getByRole('textbox', { name: 'Command' })).toBeInTheDocument()
  })

  it('shows stdio fields when stdio is selected', () => {
    renderModal()
    expect(screen.getByRole('textbox', { name: 'Command' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Args' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Env vars' })).toBeInTheDocument()
  })

  it('shows url and header fields when streamable-http is selected', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Headers' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Command' })).not.toBeInTheDocument()
  })

  it('shows name error when submitting empty name', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })

  it('shows command error when stdio command is empty', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(await screen.findByText('Command is required')).toBeInTheDocument()
  })

  it('shows url error when streamable-http url is empty', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(await screen.findByText('URL is required')).toBeInTheDocument()
  })

  it('calls addServer with correct stdio config on submit', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'GitHub MCP' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Args' }), {
      target: { value: '-y @modelcontextprotocol/server-github' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    const config = mockAddServer.mock.calls[0][0]
    expect(config.name).toBe('GitHub MCP')
    expect(config.transport.type).toBe('stdio')
    expect(config.transport.command).toBe('npx')
    expect(config.transport.args).toEqual(['-y', '@modelcontextprotocol/server-github'])
    expect(config.id).toBeDefined()
  })

  it('calls addServer with correct streamable-http config on submit', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Slack MCP' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://slack.example.com/mcp' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    const config = mockAddServer.mock.calls[0][0]
    expect(config.transport.type).toBe('streamable-http')
    expect(config.transport.url).toBe('https://slack.example.com/mcp')
  })

  it('parses env vars as KEY=VALUE pairs', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Env vars' }), {
      target: { value: 'TOKEN=abc\nDEBUG=true' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    expect(mockAddServer.mock.calls[0][0].transport.env).toEqual({ TOKEN: 'abc', DEBUG: 'true' })
  })

  it('includes the trimmed description when provided', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: '  Knowledge graph  ' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    expect(mockAddServer.mock.calls[0][0].description).toBe('Knowledge graph')
  })

  it('omits the description key when the field is left blank', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    expect('description' in mockAddServer.mock.calls[0][0]).toBe(false)
  })

  it('parses streamable-http headers as KEY=VALUE pairs', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Slack MCP' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://slack.example.com/mcp' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Headers' }), {
      target: { value: 'Authorization=Bearer abc\nX-Team=ops' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    expect(mockAddServer.mock.calls[0][0].transport.headers).toEqual({
      Authorization: 'Bearer abc',
      'X-Team': 'ops'
    })
  })

  it('closes modal after successful submit', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), {
      target: { value: 'node' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockOnClose).toHaveBeenCalledOnce())
  })

  it('keeps the modal open when addServer rejects', async () => {
    mockAddServer.mockRejectedValue(new Error('Server already exists'))
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), {
      target: { value: 'node' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    // The store surfaces the error via toast; the modal must not close and the
    // submit button must be re-enabled for a retry.
    expect(mockOnClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add Server' })).not.toBeDisabled()
  })

  it('calls onClose when Cancel is clicked', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('clears field error when user starts typing', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'X' } })
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument()
  })
})
