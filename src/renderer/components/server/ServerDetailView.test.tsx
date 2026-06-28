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

beforeEach(() => {
  vi.clearAllMocks()
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
