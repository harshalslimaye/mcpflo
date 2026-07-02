import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddServerModal } from './AddServerModal'
import { useServerStore } from '../../stores/serverStore'

const mockAddServer = vi.fn()
const mockOnClose = vi.fn()
const mockIsEncryptionAvailable = vi.fn<() => Promise<boolean>>()

beforeEach(() => {
  vi.clearAllMocks()
  useServerStore.setState({ servers: [], selectedServerId: null, addServer: mockAddServer })
  mockAddServer.mockResolvedValue(undefined)
  mockIsEncryptionAvailable.mockResolvedValue(true)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { mcp: { isEncryptionAvailable: mockIsEncryptionAvailable } }
  })
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

  it('defaults to stdio transport', () => {
    renderModal()
    expect(screen.getByRole('textbox', { name: 'Command' })).toBeInTheDocument()
  })

  it('shows stdio fields when stdio is selected', () => {
    renderModal()
    expect(screen.getByRole('textbox', { name: 'Command' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Args' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Environment Variables' })).toBeInTheDocument()
  })

  it('shows url and header fields when streamable-http is selected', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Headers' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Command' })).not.toBeInTheDocument()
  })

  it('expands env vars to reveal the editor on click', () => {
    renderModal()
    expect(screen.queryByRole('button', { name: 'Add variable' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Environment Variables' }))
    expect(screen.getByRole('button', { name: 'Add variable' })).toBeInTheDocument()
  })

  it('expands headers to reveal the editor on click', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    expect(screen.queryByRole('button', { name: 'Add header' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }))
    expect(screen.getByRole('button', { name: 'Add header' })).toBeInTheDocument()
  })

  it('shows a count badge for filled rows after collapsing env vars', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Environment Variables' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.change(screen.getByLabelText('Environment Variables 1 key'), {
      target: { value: 'TOKEN' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Environment Variables' }))
    expect(screen.getByRole('button', { name: 'Environment Variables' })).toHaveTextContent('1')
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

  it('shows a url error for a malformed URL', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'not a url' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(
      await screen.findByText('Enter a valid URL, e.g. https://mcp.example.com/mcp')
    ).toBeInTheDocument()
    expect(mockAddServer).not.toHaveBeenCalled()
  })

  it('blocks submit on a duplicate header key', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://mcp.example.com/mcp' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    fireEvent.change(screen.getByLabelText('Header 1 key'), { target: { value: 'X-Team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    // Same key, different case — HTTP headers are case-insensitive.
    fireEvent.change(screen.getByLabelText('Header 2 key'), { target: { value: 'x-team' } })
    expect(
      await screen.findByText('Duplicate header "x-team" — keys must be unique.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(mockAddServer).not.toHaveBeenCalled()
  })

  it('blocks a credential header over plain http to a remote host', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'http://mcp.example.com/mcp' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    fireEvent.change(screen.getByLabelText('Header 1 key'), { target: { value: 'Authorization' } })
    expect(await screen.findByText(/cleartext over http/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(mockAddServer).not.toHaveBeenCalled()
  })

  it('allows a credential header over http to localhost', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Local MCP' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'http://localhost:3000/mcp' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    fireEvent.change(screen.getByLabelText('Header 1 key'), { target: { value: 'Authorization' } })
    fireEvent.change(screen.getByLabelText('Header 1 value'), { target: { value: 'Bearer x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
  })

  it('blocks submit on a duplicate env var name', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Environment Variables' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.change(screen.getByLabelText('Environment Variables 1 key'), {
      target: { value: 'TOKEN' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.change(screen.getByLabelText('Environment Variables 2 key'), {
      target: { value: 'TOKEN' }
    })
    expect(
      await screen.findByText('Duplicate variable "TOKEN" — names must be unique.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(mockAddServer).not.toHaveBeenCalled()
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

  it('collects env vars as key/value pairs', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Environment Variables' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.change(screen.getByLabelText('Environment Variables 1 key'), {
      target: { value: 'TOKEN' }
    })
    fireEvent.change(screen.getByLabelText('Environment Variables 1 value'), {
      target: { value: 'abc' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.change(screen.getByLabelText('Environment Variables 2 key'), {
      target: { value: 'DEBUG' }
    })
    fireEvent.change(screen.getByLabelText('Environment Variables 2 value'), {
      target: { value: 'true' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    expect(mockAddServer.mock.calls[0][0].transport.env).toEqual({ TOKEN: 'abc', DEBUG: 'true' })
  })

  it('omits env vars whose key is left blank', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Environment Variables' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    // A value with no key should be dropped, leaving the env key absent entirely.
    fireEvent.change(screen.getByLabelText('Environment Variables 1 value'), {
      target: { value: 'orphan' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    expect('env' in mockAddServer.mock.calls[0][0].transport).toBe(false)
  })

  it('removes an env var row when its delete button is clicked', async () => {
    renderModal()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'My Server' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), { target: { value: 'npx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Environment Variables' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.change(screen.getByLabelText('Environment Variables 1 key'), {
      target: { value: 'KEEP' }
    })
    fireEvent.change(screen.getByLabelText('Environment Variables 1 value'), {
      target: { value: 'yes' }
    })
    fireEvent.change(screen.getByLabelText('Environment Variables 2 key'), {
      target: { value: 'DROP' }
    })
    fireEvent.change(screen.getByLabelText('Environment Variables 2 value'), {
      target: { value: 'no' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove environment variables 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
    expect(mockAddServer.mock.calls[0][0].transport.env).toEqual({ KEEP: 'yes' })
  })

  it('toggles a secret value between masked and visible', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    const value = screen.getByLabelText('Header 1 value')
    expect(value).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Show value' }))
    expect(value).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Hide value' }))
    expect(value).toHaveAttribute('type', 'password')
  })

  it('collects streamable-http headers as key/value pairs', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Slack MCP' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://slack.example.com/mcp' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    fireEvent.change(screen.getByLabelText('Header 1 key'), { target: { value: 'Authorization' } })
    fireEvent.change(screen.getByLabelText('Header 1 value'), { target: { value: 'Bearer abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    fireEvent.change(screen.getByLabelText('Header 2 key'), { target: { value: 'X-Team' } })
    fireEvent.change(screen.getByLabelText('Header 2 value'), { target: { value: 'ops' } })
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

  describe('Advanced', () => {
    it('expands to reveal the connection timeout field on click', () => {
      renderModal()
      expect(
        screen.queryByRole('spinbutton', { name: 'Connection timeout' })
      ).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      expect(screen.getByRole('spinbutton', { name: 'Connection timeout' })).toBeInTheDocument()
    })

    it('omits overrides when the timeout is left blank', async () => {
      renderModal()
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'My Server' }
      })
      fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), {
        target: { value: 'node' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
      expect('overrides' in mockAddServer.mock.calls[0][0]).toBe(false)
    })

    it('includes overrides.timeoutMs when a timeout is set', async () => {
      renderModal()
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'My Server' }
      })
      fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), {
        target: { value: 'node' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Connection timeout' }), {
        target: { value: '5000' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
      expect(mockAddServer.mock.calls[0][0].overrides).toEqual({ timeoutMs: 5000 })
    })

    it('shows a validation error for a non-numeric timeout', async () => {
      renderModal()
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'My Server' }
      })
      fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), {
        target: { value: 'node' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Connection timeout' }), {
        target: { value: '-1' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      expect(await screen.findByText('Timeout must be a positive number')).toBeInTheDocument()
      expect(mockAddServer).not.toHaveBeenCalled()
    })

    it('shows a count badge once a timeout is set and the section is collapsed', () => {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Connection timeout' }), {
        target: { value: '5000' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      expect(screen.getByRole('button', { name: 'Advanced' })).toHaveTextContent('1')
    })

    it('offers a protocol version select defaulting to Latest', () => {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      const select = screen.getByRole('combobox', { name: 'Protocol version' })
      expect(select).toHaveValue('')
      expect(screen.getByRole('option', { name: /^Latest/ })).toBeInTheDocument()
    })

    it('includes overrides.protocolVersion when a version is pinned', async () => {
      renderModal()
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'My Server' }
      })
      fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), {
        target: { value: 'node' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      fireEvent.change(screen.getByRole('combobox', { name: 'Protocol version' }), {
        target: { value: '2025-03-26' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
      expect(mockAddServer.mock.calls[0][0].overrides).toEqual({ protocolVersion: '2025-03-26' })
    })

    it('omits protocolVersion from overrides when Latest is kept', async () => {
      renderModal()
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'My Server' }
      })
      fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), {
        target: { value: 'node' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Connection timeout' }), {
        target: { value: '5000' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
      // Latest means "track the SDK", so nothing is persisted for it.
      expect(mockAddServer.mock.calls[0][0].overrides).toEqual({ timeoutMs: 5000 })
    })

    it('counts a pinned protocol version in the collapsed badge', () => {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      fireEvent.change(screen.getByRole('combobox', { name: 'Protocol version' }), {
        target: { value: '2025-03-26' }
      })
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Connection timeout' }), {
        target: { value: '5000' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      expect(screen.getByRole('button', { name: 'Advanced' })).toHaveTextContent('2')
    })
  })

  describe('Paste JSON config', () => {
    it('switches to the JSON textarea and back', () => {
      renderModal()
      expect(screen.queryByLabelText('JSON config')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Paste JSON config' }))
      expect(screen.getByLabelText('JSON config')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '← Back to form' }))
      expect(screen.queryByLabelText('JSON config')).not.toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
    })

    it('shows a live preview tree once the pasted text parses as an object', () => {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Paste JSON config' }))
      expect(screen.queryByText('command')).not.toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('JSON config'), {
        target: { value: JSON.stringify({ name: 'My Server', command: 'node' }) }
      })
      expect(screen.getByText('command')).toBeInTheDocument()
    })

    it('hides the preview tree again once the text becomes invalid JSON', () => {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Paste JSON config' }))
      fireEvent.change(screen.getByLabelText('JSON config'), {
        target: { value: JSON.stringify({ name: 'My Server', command: 'node' }) }
      })
      expect(screen.getByText('command')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('JSON config'), { target: { value: '{not json' } })
      expect(screen.queryByText('command')).not.toBeInTheDocument()
    })

    it('adds a single server parsed from a bare JSON entry', async () => {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Paste JSON config' }))
      fireEvent.change(screen.getByLabelText('JSON config'), {
        target: { value: JSON.stringify({ name: 'My Server', command: 'node' }) }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
      const config = mockAddServer.mock.calls[0][0]
      expect(config.name).toBe('My Server')
      expect(config.transport).toEqual({ type: 'stdio', command: 'node' })
    })

    it('adds every server from a multi-entry mcpServers object', async () => {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Paste JSON config' }))
      fireEvent.change(screen.getByLabelText('JSON config'), {
        target: {
          value: JSON.stringify({
            mcpServers: {
              github: { command: 'npx', args: ['-y', 'gh-server'] },
              slack: { url: 'https://slack.example.com/mcp' }
            }
          })
        }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      await waitFor(() => expect(mockAddServer).toHaveBeenCalledTimes(2))
      expect(mockAddServer.mock.calls[0][0].name).toBe('github')
      expect(mockAddServer.mock.calls[1][0].name).toBe('slack')
      expect(mockOnClose).toHaveBeenCalledOnce()
    })

    it('shows an inline error for invalid JSON and does not add anything', async () => {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Paste JSON config' }))
      fireEvent.change(screen.getByLabelText('JSON config'), { target: { value: '{not json' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      expect(await screen.findByText('Invalid JSON')).toBeInTheDocument()
      expect(mockAddServer).not.toHaveBeenCalled()
    })

    it('rejects a name that collides with an existing server', async () => {
      useServerStore.setState({
        servers: [
          {
            id: 'existing',
            name: 'github',
            transport: { type: 'stdio', command: 'npx' },
            status: 'disconnected',
            tools: [],
            resources: [],
            prompts: []
          }
        ],
        selectedServerId: null,
        addServer: mockAddServer
      })
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Paste JSON config' }))
      fireEvent.change(screen.getByLabelText('JSON config'), {
        target: { value: JSON.stringify({ mcpServers: { github: { command: 'npx' } } }) }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      expect(await screen.findByText('A server named "github" already exists')).toBeInTheDocument()
      expect(mockAddServer).not.toHaveBeenCalled()
    })

    it('clears the JSON error when the textarea is edited', async () => {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Paste JSON config' }))
      fireEvent.change(screen.getByLabelText('JSON config'), { target: { value: '{not json' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      expect(await screen.findByText('Invalid JSON')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('JSON config'), {
        target: { value: JSON.stringify({ name: 'X', command: 'node' }) }
      })
      expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument()
    })
  })

  describe('OAuth', () => {
    function selectHttp(): void {
      fireEvent.click(screen.getByRole('button', { name: 'streamable-http' }))
    }
    function fillBasics(): void {
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'OAuth MCP' }
      })
      fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
        target: { value: 'https://oauth.example.com/mcp' }
      })
    }

    it('offers an Auth selector defaulting to None, with OAuth fields hidden', () => {
      renderModal()
      selectHttp()
      expect(screen.getByRole('button', { name: 'None' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'OAuth' })).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Client ID' })).not.toBeInTheDocument()
    })

    it('reveals Client ID / Client Secret / Scope when OAuth is selected', () => {
      renderModal()
      selectHttp()
      fireEvent.click(screen.getByRole('button', { name: 'OAuth' }))
      expect(screen.getByRole('textbox', { name: 'Client ID' })).toBeInTheDocument()
      expect(screen.getByLabelText('Client Secret')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Scope' })).toBeInTheDocument()
    })

    it('builds an oauth transport with the entered client config', async () => {
      renderModal()
      selectHttp()
      fillBasics()
      fireEvent.click(screen.getByRole('button', { name: 'OAuth' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Client ID' }), {
        target: { value: 'cid' }
      })
      fireEvent.change(screen.getByLabelText('Client Secret'), { target: { value: 'sec' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'Scope' }), {
        target: { value: 'read:tools' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
      expect(mockAddServer.mock.calls[0][0].transport).toMatchObject({
        type: 'streamable-http',
        url: 'https://oauth.example.com/mcp',
        auth: 'oauth',
        oauth: { clientId: 'cid', clientSecret: 'sec', scope: 'read:tools' }
      })
    })

    it('omits the oauth object entirely for pure DCR (no fields filled)', async () => {
      renderModal()
      selectHttp()
      fillBasics()
      fireEvent.click(screen.getByRole('button', { name: 'OAuth' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      await waitFor(() => expect(mockAddServer).toHaveBeenCalledOnce())
      const transport = mockAddServer.mock.calls[0][0].transport
      expect(transport.auth).toBe('oauth')
      expect(transport.oauth).toBeUndefined()
    })

    it('blocks submit and shows an error when a custom Authorization header is set', () => {
      renderModal()
      selectHttp()
      fillBasics()
      fireEvent.click(screen.getByRole('button', { name: 'OAuth' }))
      fireEvent.click(screen.getByRole('button', { name: 'Headers' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
      fireEvent.change(screen.getByLabelText('Header 1 key'), {
        target: { value: 'Authorization' }
      })
      expect(
        screen.getByText('Authorization is managed by OAuth — remove it from headers.')
      ).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      expect(mockAddServer).not.toHaveBeenCalled()
    })

    it('blocks OAuth mode when OS encryption is unavailable', async () => {
      mockIsEncryptionAvailable.mockResolvedValue(false)
      renderModal()
      selectHttp()
      fillBasics()
      fireEvent.click(screen.getByRole('button', { name: 'OAuth' }))
      expect(
        await screen.findByText(/OAuth tokens require OS-level encryption/i)
      ).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
      expect(mockAddServer).not.toHaveBeenCalled()
    })
  })
})
