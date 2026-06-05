import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SecondarySidebar } from './SecondarySidebar'
import { useServerStore } from '../../stores/serverStore'
import type { MCPServer } from '../../../shared/mcp.types'

const mockServers: MCPServer[] = [
  {
    // Cached / green — capabilities already fetched.
    id: 'memory-mcp',
    name: 'Memory MCP',
    transport: { type: 'stdio', command: 'npx' },
    status: 'connected',
    fetchedAt: 1000,
    tools: [
      { name: 'create_entities', inputSchema: { type: 'object' } },
      { name: 'search_nodes', inputSchema: { type: 'object' } }
    ],
    resources: [{ uri: 'memory://graph', name: 'Graph' }],
    prompts: []
  },
  {
    // Never fetched / grey.
    id: 'slack-mcp',
    name: 'Slack MCP',
    transport: { type: 'sse', url: 'https://slack.example.com' },
    status: 'disconnected',
    tools: [],
    resources: [],
    prompts: []
  }
]

const mockFetchCapabilities = vi.fn()
const mockRefreshCapabilities = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchCapabilities.mockResolvedValue(undefined)
  mockRefreshCapabilities.mockResolvedValue(undefined)
  useServerStore.setState({
    servers: mockServers,
    selectedServerId: null,
    fetchCapabilities: mockFetchCapabilities,
    refreshCapabilities: mockRefreshCapabilities
  })
})

describe('SecondarySidebar', () => {
  it('renders section title', () => {
    render(<SecondarySidebar />)
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
  })

  it('renders Add Server button', () => {
    render(<SecondarySidebar />)
    expect(screen.getByText('+ Add Server')).toBeInTheDocument()
  })

  it('renders all server names', () => {
    render(<SecondarySidebar />)
    expect(screen.getByText('Memory MCP')).toBeInTheDocument()
    expect(screen.getByText('Slack MCP')).toBeInTheDocument()
  })

  it('does not show groups before server is expanded', () => {
    render(<SecondarySidebar />)
    expect(screen.queryByText('Tools')).not.toBeInTheDocument()
  })

  it('shows group rows after server is expanded', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Memory MCP'))
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('Resources')).toBeInTheDocument()
    expect(screen.getByText('Prompts')).toBeInTheDocument()
  })

  it('collapses server on second click', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Memory MCP'))
    fireEvent.click(screen.getByText('Memory MCP'))
    expect(screen.queryByText('Tools')).not.toBeInTheDocument()
  })

  it('shows correct tool count in group row', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Memory MCP'))
    const toolsRow = screen.getByText('Tools').closest('button')
    expect(toolsRow).toHaveTextContent('2')
  })

  it('does not show tool items before Tools group is expanded', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Memory MCP'))
    expect(screen.queryByText('create_entities')).not.toBeInTheDocument()
  })

  it('shows tool items after Tools group is expanded', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Memory MCP'))
    fireEvent.click(screen.getByText('Tools'))
    expect(screen.getByText('create_entities')).toBeInTheDocument()
    expect(screen.getByText('search_nodes')).toBeInTheDocument()
  })

  it('disables group row when count is 0', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Memory MCP'))
    const promptsBtn = screen.getByText('Prompts').closest('button')
    expect(promptsBtn).toBeDisabled()
  })

  it('does not expand disabled group when clicked', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Memory MCP'))
    fireEvent.click(screen.getByText('Prompts'))
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('expands independent servers independently', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Memory MCP'))
    expect(screen.queryByText('Slack MCP')).toBeInTheDocument()
    expect(screen.getAllByText('Tools')).toHaveLength(1)
  })

  it('renders empty list when no servers in store', () => {
    useServerStore.setState({ servers: [] })
    render(<SecondarySidebar />)
    expect(screen.queryByText('Memory MCP')).not.toBeInTheDocument()
  })

  it('opens AddServerModal when Add Server is clicked', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('+ Add Server'))
    expect(screen.getByText('Add MCP Server')).toBeInTheDocument()
  })

  it('closes AddServerModal when modal is dismissed', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('+ Add Server'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Add MCP Server')).not.toBeInTheDocument()
  })

  it('fetches capabilities when a never-fetched (grey) server is expanded', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Slack MCP'))
    expect(mockFetchCapabilities).toHaveBeenCalledWith('slack-mcp')
  })

  it('does not fetch when expanding a cached (green) server', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Memory MCP'))
    expect(mockFetchCapabilities).not.toHaveBeenCalled()
  })

  it('does not fetch when collapsing a server', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Slack MCP')) // expand → fetch
    mockFetchCapabilities.mockClear()
    fireEvent.click(screen.getByText('Slack MCP')) // collapse → no fetch
    expect(mockFetchCapabilities).not.toHaveBeenCalled()
  })

  it('calls refreshCapabilities when the refresh control is clicked', () => {
    render(<SecondarySidebar />)
    const serverBtn = screen.getByText('Memory MCP').closest('button')
    const refresh = serverBtn?.querySelector('[title="Refresh capabilities"]') as HTMLElement
    fireEvent.click(refresh)
    expect(mockRefreshCapabilities).toHaveBeenCalledWith('memory-mcp')
  })

  it('refresh control does not toggle the server', () => {
    render(<SecondarySidebar />)
    const serverBtn = screen.getByText('Memory MCP').closest('button')
    const refresh = serverBtn?.querySelector('[title="Refresh capabilities"]') as HTMLElement
    fireEvent.click(refresh)
    // groups should NOT appear — the click was on refresh, not the row toggle
    expect(screen.queryByText('Tools')).not.toBeInTheDocument()
  })

  it('shows status dot on server row', () => {
    render(<SecondarySidebar />)
    const serverBtn = screen.getByText('Memory MCP').closest('button')
    expect(serverBtn?.querySelector('[title="connected"]')).toBeInTheDocument()
  })

  it('opens the delete confirmation when the delete control is clicked', () => {
    render(<SecondarySidebar />)
    const serverBtn = screen.getByText('Memory MCP').closest('button')
    const del = serverBtn?.querySelector('[title="Delete server"]') as HTMLElement
    fireEvent.click(del)
    expect(screen.getByText('Delete Server')).toBeInTheDocument()
  })

  it('delete control does not toggle the server', () => {
    render(<SecondarySidebar />)
    const serverBtn = screen.getByText('Slack MCP').closest('button')
    const del = serverBtn?.querySelector('[title="Delete server"]') as HTMLElement
    fireEvent.click(del)
    expect(mockFetchCapabilities).not.toHaveBeenCalled()
  })
})
