import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ServerDetailView } from './ServerDetailView'
import { useServerStore } from '../../stores/serverStore'
import type { MCPServer } from '../../../shared/mcp.types'

const base: MCPServer = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp/' },
  status: 'connected',
  fetchedAt: Date.now() - 60 * 1000,
  tools: [],
  resources: [],
  prompts: []
}

const server = (over: Partial<MCPServer> = {}): MCPServer => ({ ...base, ...over })

const mockRefresh = vi.fn()
const mockDisconnect = vi.fn()
const mockClearAuth = vi.fn()

// AuthDetailsCard fetches its summary over the preload bridge when the server
// is authenticated; resolve null so the card stays hidden in these tests.
const mockGetAuthDetails = vi.fn()
;(globalThis as Record<string, unknown>).api = { mcp: { getAuthDetails: mockGetAuthDetails } }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuthDetails.mockResolvedValue(null)
  useServerStore.setState({
    servers: [base],
    refreshCapabilities: mockRefresh,
    disconnectServer: mockDisconnect,
    clearAuth: mockClearAuth
  })
})

describe('ServerDetailView', () => {
  it('renders the header and action bar', () => {
    render(<ServerDetailView server={server()} />)
    expect(screen.getByRole('heading', { name: 'GitHub MCP' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload capabilities' })).toBeInTheDocument()
  })

  it('omits the context budget card when the server has no capabilities', () => {
    render(<ServerDetailView server={server()} />)
    expect(screen.queryByText('Context budget')).not.toBeInTheDocument()
  })

  it('renders the context budget card when the server has capabilities', () => {
    render(
      <ServerDetailView
        server={server({ tools: [{ name: 'x', inputSchema: { type: 'object' } }] })}
      />
    )
    expect(screen.getByText('Context budget')).toBeInTheDocument()
  })

  it('renders the capability sections when the server has capabilities', () => {
    render(
      <ServerDetailView
        server={server({ tools: [{ name: 'x', inputSchema: { type: 'object' } }] })}
      />
    )
    expect(screen.getByRole('button', { name: /Tools/ })).toBeInTheDocument()
    expect(screen.getByText('x')).toBeInTheDocument()
  })

  it('reloads capabilities for the server', () => {
    render(<ServerDetailView server={server()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload capabilities' }))
    expect(mockRefresh).toHaveBeenCalledWith('github-mcp')
  })

  it('disconnects the server', () => {
    render(<ServerDetailView server={server()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(mockDisconnect).toHaveBeenCalledWith('github-mcp')
  })

  it('signs out an authenticated OAuth server', () => {
    render(<ServerDetailView server={server({ auth: { status: 'authenticated' } })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockClearAuth).toHaveBeenCalledWith('github-mcp')
  })

  describe('delete', () => {
    it('opens the delete confirmation when Delete server is clicked', () => {
      render(<ServerDetailView server={server()} />)
      expect(screen.queryByText('Delete Server')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Delete server' }))
      expect(screen.getByText('Delete Server')).toBeInTheDocument()
    })

    it('closes the delete confirmation on Cancel', () => {
      render(<ServerDetailView server={server()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Delete server' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByText('Delete Server')).not.toBeInTheDocument()
    })
  })
})
