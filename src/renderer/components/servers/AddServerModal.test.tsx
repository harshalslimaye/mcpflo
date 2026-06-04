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

function renderModal() {
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

  it('shows url field when sse is selected', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'sse' }))
    expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Headers' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Command' })).not.toBeInTheDocument()
  })

  it('shows url field when streamable-http is selected', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument()
  })

  it('shows name error when submitting empty name', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })

  it('shows command error when stdio command is empty', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'My Server' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(await screen.findByText('Command is required')).toBeInTheDocument()
  })

  it('shows url error when sse url is empty', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'sse' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'My Server' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(await screen.findByText('URL is required')).toBeInTheDocument()
  })

  it('calls addServer with correct stdio config on submit', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'GitHub MCP' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Args' }), { target: { value: '-y @modelcontextprotocol/server-github' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    const config = mockAddServer.mock.calls[0][0]
    expect(config.name).toBe('GitHub MCP')
    expect(config.transport.type).toBe('stdio')
    expect(config.transport.command).toBe('npx')
    expect(config.transport.args).toEqual(['-y', '@modelcontextprotocol/server-github'])
    expect(config.id).toBeDefined()
  })

  it('calls addServer with correct sse config on submit', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'sse' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Slack MCP' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), { target: { value: 'https://slack.example.com/sse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    const config = mockAddServer.mock.calls[0][0]
    expect(config.transport.type).toBe('sse')
    expect(config.transport.url).toBe('https://slack.example.com/sse')
  })

  it('parses env vars as KEY=VALUE pairs', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'My Server' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Env vars' }), { target: { value: 'TOKEN=abc\nDEBUG=true' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    expect(mockAddServer.mock.calls[0][0].transport.env).toEqual({ TOKEN: 'abc', DEBUG: 'true' })
  })

  it('closes modal after successful submit', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'My Server' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'node' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockOnClose).toHaveBeenCalledOnce())
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
