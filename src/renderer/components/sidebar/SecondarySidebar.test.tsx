import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { SecondarySidebar } from './SecondarySidebar'
import { useServerStore } from '../../stores/serverStore'
import { useUiStore } from '../../stores/uiStore'
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
    transport: { type: 'streamable-http', url: 'https://slack.example.com' },
    status: 'disconnected',
    tools: [],
    resources: [],
    prompts: []
  }
]

const mockFetchCapabilities = vi.fn()
const mockRefreshCapabilities = vi.fn()
const mockDisconnectServer = vi.fn()

// The server row's outer wrapper div, scoping queries for that row's chevron
// and inline controls (refresh/disconnect/delete/status dot).
function serverRow(name: string): HTMLElement {
  return screen.getByText(name).closest('div') as HTMLElement
}

// Clicks the row's chevron — expand/collapse now lives there exclusively;
// clicking the name itself selects the server instead (see "server
// selection" describe block below).
function toggleServer(name: string): void {
  fireEvent.click(within(serverRow(name)).getByLabelText(/Expand|Collapse/))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchCapabilities.mockResolvedValue(undefined)
  mockRefreshCapabilities.mockResolvedValue(undefined)
  mockDisconnectServer.mockResolvedValue(undefined)
  // AddServerModal (rendered by the sidebar) queries encryption availability on
  // mount; stub the bridge so its effect doesn't crash.
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { mcp: { isEncryptionAvailable: vi.fn().mockResolvedValue(true) } }
  })
  useServerStore.setState({
    servers: mockServers,
    selectedServerId: null,
    selectedTool: null,
    selectedResource: null,
    fetchCapabilities: mockFetchCapabilities,
    refreshCapabilities: mockRefreshCapabilities,
    disconnectServer: mockDisconnectServer
  })
})

describe('SecondarySidebar', () => {
  it('renders section title', () => {
    render(<SecondarySidebar />)
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
  })

  it('renders Add Server button', () => {
    render(<SecondarySidebar />)
    expect(screen.getByText('Add Server')).toBeInTheDocument()
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
    toggleServer('Memory MCP')
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('Resources')).toBeInTheDocument()
    expect(screen.getByText('Prompts')).toBeInTheDocument()
  })

  it('collapses server on second chevron click', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    toggleServer('Memory MCP')
    expect(screen.queryByText('Tools')).not.toBeInTheDocument()
  })

  it('shows correct tool count in group row', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    const toolsRow = screen.getByText('Tools').closest('button')
    expect(toolsRow).toHaveTextContent('2')
  })

  it('does not show tool items before Tools group is expanded', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    expect(screen.queryByText('create_entities')).not.toBeInTheDocument()
  })

  it('shows tool items after Tools group is expanded', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    fireEvent.click(screen.getByText('Tools'))
    expect(screen.getByText('create_entities')).toBeInTheDocument()
    expect(screen.getByText('search_nodes')).toBeInTheDocument()
  })

  it('disables group row when count is 0', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    const promptsBtn = screen.getByText('Prompts').closest('button')
    expect(promptsBtn).toBeDisabled()
  })

  it('does not expand disabled group when clicked', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    fireEvent.click(screen.getByText('Prompts'))
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('expands independent servers independently', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    expect(screen.queryByText('Slack MCP')).toBeInTheDocument()
    expect(screen.getAllByText('Tools')).toHaveLength(1)
  })

  it('renders empty list when no servers in store', () => {
    useServerStore.setState({ servers: [] })
    render(<SecondarySidebar />)
    expect(screen.queryByText('Memory MCP')).not.toBeInTheDocument()
  })

  it('renders the filter input', () => {
    render(<SecondarySidebar />)
    expect(screen.getByPlaceholderText('Filter tools, resources…')).toBeInTheDocument()
  })

  it('filters tools by name and auto-expands matches', () => {
    render(<SecondarySidebar />)
    fireEvent.change(screen.getByPlaceholderText('Filter tools, resources…'), {
      target: { value: 'create' }
    })
    // No manual expansion clicks — filtering force-expands matching servers/groups.
    expect(screen.getByText('create_entities')).toBeInTheDocument()
    expect(screen.queryByText('search_nodes')).not.toBeInTheDocument()
  })

  it('matches resources too', () => {
    render(<SecondarySidebar />)
    fireEvent.change(screen.getByPlaceholderText('Filter tools, resources…'), {
      target: { value: 'graph' }
    })
    expect(screen.getByText('Graph')).toBeInTheDocument()
  })

  it('hides servers with no matching capabilities while filtering', () => {
    render(<SecondarySidebar />)
    fireEvent.change(screen.getByPlaceholderText('Filter tools, resources…'), {
      target: { value: 'create' }
    })
    expect(screen.queryByText('Slack MCP')).not.toBeInTheDocument()
  })

  it('shows nothing when the filter matches no capabilities', () => {
    render(<SecondarySidebar />)
    fireEvent.change(screen.getByPlaceholderText('Filter tools, resources…'), {
      target: { value: 'zzz-no-match' }
    })
    expect(screen.queryByText('create_entities')).not.toBeInTheDocument()
    expect(screen.queryByText('Memory MCP')).not.toBeInTheDocument()
  })

  it('restores the collapsed tree when the filter is cleared', () => {
    render(<SecondarySidebar />)
    const input = screen.getByPlaceholderText('Filter tools, resources…')
    fireEvent.change(input, { target: { value: 'create' } })
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByText('Memory MCP')).toBeInTheDocument()
    // Back to default (collapsed) state — groups not shown.
    expect(screen.queryByText('Tools')).not.toBeInTheDocument()
  })

  it('focuses the filter input on ⌘K', () => {
    render(<SecondarySidebar />)
    const input = screen.getByPlaceholderText('Filter tools, resources…')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(input).toHaveFocus()
  })

  it('opens AddServerModal when Add Server is clicked', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Add Server'))
    expect(screen.getByText('Add MCP Server')).toBeInTheDocument()
  })

  it('closes AddServerModal when modal is dismissed', () => {
    render(<SecondarySidebar />)
    fireEvent.click(screen.getByText('Add Server'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Add MCP Server')).not.toBeInTheDocument()
  })

  it('fetches capabilities when a never-fetched (grey) server is expanded', () => {
    render(<SecondarySidebar />)
    toggleServer('Slack MCP')
    expect(mockFetchCapabilities).toHaveBeenCalledWith('slack-mcp')
  })

  it('does not fetch when expanding a cached (green) server', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    expect(mockFetchCapabilities).not.toHaveBeenCalled()
  })

  it('does not fetch when collapsing a connected (green) server', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP') // expand, already connected
    mockFetchCapabilities.mockClear()
    toggleServer('Memory MCP') // collapse → no fetch
    expect(mockFetchCapabilities).not.toHaveBeenCalled()
  })

  // The mock store doesn't flip status to 'connected' on fetch, so the server
  // stays disconnected here — mirroring a failed/declined OAuth attempt. There's
  // no separate "Sign in" control, so every click (expand or collapse) on a
  // still-disconnected server must retry the connect.
  it('retries the fetch on every click while a server stays disconnected, even when collapsing', () => {
    render(<SecondarySidebar />)
    toggleServer('Slack MCP') // expand → fetch
    mockFetchCapabilities.mockClear()
    toggleServer('Slack MCP') // collapse, still disconnected → retry
    expect(mockFetchCapabilities).toHaveBeenCalledWith('slack-mcp')
  })

  it('calls refreshCapabilities when the refresh control is clicked', () => {
    render(<SecondarySidebar />)
    const refresh = within(serverRow('Memory MCP')).getByTitle('Refresh capabilities')
    fireEvent.click(refresh)
    expect(mockRefreshCapabilities).toHaveBeenCalledWith('memory-mcp')
  })

  it('refresh control does not toggle the server', () => {
    render(<SecondarySidebar />)
    const refresh = within(serverRow('Memory MCP')).getByTitle('Refresh capabilities')
    fireEvent.click(refresh)
    // groups should NOT appear — the click was on refresh, not the row toggle
    expect(screen.queryByText('Tools')).not.toBeInTheDocument()
  })

  it('shows status dot on server row', () => {
    render(<SecondarySidebar />)
    expect(within(serverRow('Memory MCP')).getByTitle('connected')).toBeInTheDocument()
  })

  it('renders a disconnect control on a connected server but not a disconnected one', () => {
    render(<SecondarySidebar />)
    expect(within(serverRow('Memory MCP')).queryByTitle('Disconnect server')).toBeInTheDocument()
    expect(within(serverRow('Slack MCP')).queryByTitle('Disconnect server')).not.toBeInTheDocument()
  })

  it('calls disconnectServer and collapses the row when the disconnect control is clicked', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP') // expand
    expect(screen.getByText('Tools')).toBeInTheDocument()

    const disconnect = within(serverRow('Memory MCP')).getByTitle('Disconnect server')
    fireEvent.click(disconnect)

    expect(mockDisconnectServer).toHaveBeenCalledWith('memory-mcp')
    // Disconnecting forces the row shut regardless of expand state.
    expect(screen.queryByText('Tools')).not.toBeInTheDocument()
  })

  it('disconnect control does not toggle the server when collapsed', () => {
    render(<SecondarySidebar />)
    const disconnect = within(serverRow('Memory MCP')).getByTitle('Disconnect server')
    fireEvent.click(disconnect)
    // The row was never expanded — disconnecting it shouldn't expand it either.
    expect(screen.queryByText('Tools')).not.toBeInTheDocument()
  })

  it('re-fetches on next expand after a server is disconnected (grey)', () => {
    render(<SecondarySidebar />)
    // Simulates the post-disconnect state: status reset to disconnected (grey).
    act(() => {
      useServerStore.setState({
        servers: mockServers.map((s) =>
          s.id === 'memory-mcp' ? { ...s, status: 'disconnected' as const } : s
        )
      })
    })
    toggleServer('Memory MCP')
    expect(mockFetchCapabilities).toHaveBeenCalledWith('memory-mcp')
  })

  it('opens the delete confirmation when the delete control is clicked', () => {
    render(<SecondarySidebar />)
    const del = within(serverRow('Memory MCP')).getByTitle('Delete server')
    fireEvent.click(del)
    expect(screen.getByText('Delete Server')).toBeInTheDocument()
  })

  it('delete control does not toggle the server', () => {
    render(<SecondarySidebar />)
    const del = within(serverRow('Slack MCP')).getByTitle('Delete server')
    fireEvent.click(del)
    expect(mockFetchCapabilities).not.toHaveBeenCalled()
  })

  it('selects a tool in the store when a tool item is clicked', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    fireEvent.click(screen.getByText('Tools'))
    fireEvent.click(screen.getByText('create_entities'))
    expect(useServerStore.getState().selectedTool).toEqual({
      serverId: 'memory-mcp',
      toolName: 'create_entities'
    })
  })

  it('collapses an expanded group on second click', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    fireEvent.click(screen.getByText('Tools'))
    expect(screen.getByText('create_entities')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Tools'))
    expect(screen.queryByText('create_entities')).not.toBeInTheDocument()
  })

  it('closes the delete confirmation on Cancel', () => {
    render(<SecondarySidebar />)
    const del = within(serverRow('Memory MCP')).getByTitle('Delete server')
    fireEvent.click(del)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Delete Server')).not.toBeInTheDocument()
  })

  it('labels an unnamed resource with its uri and selects it by that uri', () => {
    useServerStore.setState({
      servers: [{ ...mockServers[0], resources: [{ uri: 'memory://graph' }] }]
    })
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    fireEvent.click(screen.getByText('Resources'))
    fireEvent.click(screen.getByText('memory://graph'))
    expect(useServerStore.getState().selectedResource).toEqual({
      serverId: 'memory-mcp',
      uri: 'memory://graph'
    })
  })

  it('selects a resource in the store when a resource item is clicked', () => {
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    fireEvent.click(screen.getByText('Resources'))
    // The resource is named "Graph" but is identified (and selected) by its uri.
    fireEvent.click(screen.getByText('Graph'))
    expect(useServerStore.getState().selectedResource).toEqual({
      serverId: 'memory-mcp',
      uri: 'memory://graph'
    })
  })

  it('marks the selected resource with aria-current', () => {
    useServerStore.setState({
      selectedResource: { serverId: 'memory-mcp', uri: 'memory://graph' }
    })
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    fireEvent.click(screen.getByText('Resources'))
    expect(screen.getByText('Graph').closest('button')).toHaveAttribute('aria-current', 'true')
  })

  it('marks the selected tool with aria-current', () => {
    useServerStore.setState({ selectedTool: { serverId: 'memory-mcp', toolName: 'search_nodes' } })
    render(<SecondarySidebar />)
    toggleServer('Memory MCP')
    fireEvent.click(screen.getByText('Tools'))
    expect(screen.getByText('search_nodes').closest('button')).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  describe('server selection', () => {
    it('selects a server in the store when its name is clicked', () => {
      render(<SecondarySidebar />)
      fireEvent.click(screen.getByText('Memory MCP'))
      expect(useServerStore.getState().selectedServerId).toBe('memory-mcp')
    })

    it('does not expand the tree when the name is clicked', () => {
      render(<SecondarySidebar />)
      fireEvent.click(screen.getByText('Memory MCP'))
      expect(screen.queryByText('Tools')).not.toBeInTheDocument()
    })

    it('does not select the server when the chevron is clicked', () => {
      render(<SecondarySidebar />)
      toggleServer('Memory MCP')
      expect(useServerStore.getState().selectedServerId).toBeNull()
    })

    it('fetches capabilities when a never-fetched (grey) server is selected by name', () => {
      render(<SecondarySidebar />)
      fireEvent.click(screen.getByText('Slack MCP'))
      expect(mockFetchCapabilities).toHaveBeenCalledWith('slack-mcp')
    })

    it('highlights the row body of the selected server', () => {
      useServerStore.setState({ selectedServerId: 'memory-mcp' })
      render(<SecondarySidebar />)
      expect(screen.getByRole('button', { name: 'Memory MCP' })).toHaveClass('text-accent')
      expect(screen.getByRole('button', { name: 'Slack MCP' })).not.toHaveClass('text-accent')
    })

    it('clears the selected tool when a server name is clicked', () => {
      useServerStore.setState({
        selectedTool: { serverId: 'memory-mcp', toolName: 'search_nodes' }
      })
      render(<SecondarySidebar />)
      fireEvent.click(screen.getByText('Memory MCP'))
      expect(useServerStore.getState().selectedTool).toBeNull()
      expect(useServerStore.getState().selectedServerId).toBe('memory-mcp')
    })
  })

  describe('expand/collapse all', () => {
    it('expands every server and group in one click', () => {
      render(<SecondarySidebar />)
      fireEvent.click(screen.getByLabelText('Expand all'))
      // Both servers expanded, with their (non-empty) groups and items showing.
      expect(screen.getByText('create_entities')).toBeInTheDocument()
      expect(screen.getByText('search_nodes')).toBeInTheDocument()
      expect(screen.getByText('Graph')).toBeInTheDocument()
    })

    it('fetches capabilities for never-fetched (grey) servers on expand all', () => {
      render(<SecondarySidebar />)
      fireEvent.click(screen.getByLabelText('Expand all'))
      expect(mockFetchCapabilities).toHaveBeenCalledWith('slack-mcp')
      expect(mockFetchCapabilities).not.toHaveBeenCalledWith('memory-mcp')
    })

    it('collapses every server in one click', () => {
      render(<SecondarySidebar />)
      fireEvent.click(screen.getByLabelText('Expand all'))
      fireEvent.click(screen.getByLabelText('Collapse all'))
      expect(screen.queryByText('Tools')).not.toBeInTheDocument()
      expect(screen.queryByText('create_entities')).not.toBeInTheDocument()
    })

    it('disables the controls while filtering', () => {
      render(<SecondarySidebar />)
      fireEvent.change(screen.getByPlaceholderText('Filter tools, resources…'), {
        target: { value: 'create' }
      })
      expect(screen.getByRole('button', { name: /expand all|collapse all/i })).toBeDisabled()
    })

    it('disables the controls when there are no servers', () => {
      useServerStore.setState({ servers: [] })
      render(<SecondarySidebar />)
      expect(screen.getByRole('button', { name: /expand all|collapse all/i })).toBeDisabled()
    })
  })

  describe('collapse toggle', () => {
    beforeEach(() => {
      useUiStore.setState({ sidebarCollapsed: false })
    })

    it('collapses to the rail when the collapse button is clicked', () => {
      render(<SecondarySidebar />)
      fireEvent.click(screen.getByLabelText('Collapse sidebar'))
      expect(useUiStore.getState().sidebarCollapsed).toBe(true)
      // Full content is hidden from assistive tech; the expand affordance shows.
      expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument()
    })

    it('expands again when the rail button is clicked', () => {
      useUiStore.setState({ sidebarCollapsed: true })
      render(<SecondarySidebar />)
      fireEvent.click(screen.getByLabelText('Expand sidebar'))
      expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    })

    it('toggles with the ⌘B shortcut', () => {
      render(<SecondarySidebar />)
      fireEvent.keyDown(window, { key: 'b', metaKey: true })
      expect(useUiStore.getState().sidebarCollapsed).toBe(true)
      fireEvent.keyDown(window, { key: 'b', metaKey: true })
      expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    })
  })
})
