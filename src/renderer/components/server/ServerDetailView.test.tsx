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

  it('renders the capability sections under the Capabilities tab', () => {
    render(
      <ServerDetailView
        server={server({ tools: [{ name: 'x', inputSchema: { type: 'object' } }] })}
      />
    )
    expect(screen.queryByText('x')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Capabilities (1)' }))
    expect(screen.getByRole('button', { name: /Tools/ })).toBeInTheDocument()
    expect(screen.getByText('x')).toBeInTheDocument()
  })

  describe('summary tiles', () => {
    const multi = server({
      tools: [{ name: 'x', inputSchema: { type: 'object' } }],
      resources: [{ uri: 'r://one' }],
      prompts: []
    })

    it('shows a tile per category with its count', () => {
      render(<ServerDetailView server={multi} />)
      expect(screen.getByRole('button', { name: /Tools/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Resources/ })).toBeInTheDocument()
    })

    it('disables the tile for an empty category', () => {
      render(<ServerDetailView server={multi} />)
      const promptsTile = screen.getAllByRole('button').find((b) => b.textContent?.includes('0'))
      expect(promptsTile).toBeDisabled()
    })

    it('jumps to the Capabilities tab filtered to the clicked category', () => {
      render(<ServerDetailView server={multi} />)
      fireEvent.click(screen.getByRole('button', { name: /^Resources/ }))
      expect(screen.getByText('r://one')).toBeInTheDocument()
      expect(screen.queryByText('x')).not.toBeInTheDocument()
    })

    it('shows all categories when the Capabilities tab is opened directly', () => {
      render(<ServerDetailView server={multi} />)
      fireEvent.click(screen.getByRole('button', { name: 'Capabilities (2)' }))
      expect(screen.getByText('x')).toBeInTheDocument()
      expect(screen.getByText('r://one')).toBeInTheDocument()
    })
  })

  describe('auth_required', () => {
    it('shows the Auth card side-by-side with the budget card', () => {
      render(
        <ServerDetailView
          server={server({
            auth: { status: 'auth_required' },
            tools: [{ name: 'x', inputSchema: { type: 'object' } }]
          })}
        />
      )
      expect(screen.getByText('Needs re-auth')).toBeInTheDocument()
      expect(screen.getByText('Context budget')).toBeInTheDocument()
    })
  })

  describe('tabs', () => {
    it('shows Overview, Capabilities, and Tests, starting on Overview', () => {
      render(<ServerDetailView server={server()} />)
      expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Capabilities' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Tests' })).toBeInTheDocument()
    })

    it('switches to the Tests tab and shows the capability groups', () => {
      render(
        <ServerDetailView
          server={server({ tools: [{ name: 'x', inputSchema: { type: 'object' } }] })}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: 'Tests' }))
      expect(screen.getByText('x')).toBeInTheDocument()
    })
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
