import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContentArea } from './ContentArea'
import { useServerStore } from '../../stores/serverStore'
import type { MCPServer } from '../../../shared/mcp.types'

const server: MCPServer = {
  id: 'memory-mcp',
  name: 'Memory MCP',
  transport: { type: 'stdio', command: 'npx' },
  status: 'connected',
  tools: [
    {
      name: 'search_nodes',
      description: 'Search the graph',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: [] }
    }
  ],
  resources: [{ uri: 'memory://graph', name: 'Graph', description: 'The knowledge graph' }],
  prompts: []
}

beforeEach(() => {
  useServerStore.setState({
    servers: [],
    selectedServerId: null,
    selectedTool: null,
    selectedResource: null
  })
})

describe('ContentArea — empty state', () => {
  it('prompts to add a server when none exist', () => {
    render(<ContentArea />)
    expect(screen.getByText('No servers yet')).toBeInTheDocument()
    expect(
      screen.getByText('Add an MCP server from the sidebar to get started')
    ).toBeInTheDocument()
  })

  it('prompts to pick a capability when servers exist but nothing is selected', () => {
    useServerStore.setState({ servers: [server] })
    render(<ContentArea />)
    expect(screen.getByText('Ready when you are')).toBeInTheDocument()
    expect(
      screen.getByText('Choose a tool, resource, or prompt to get started')
    ).toBeInTheDocument()
  })

  it('renders the server icon', () => {
    const { container } = render(<ContentArea />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('contains a flex centering container', () => {
    const { container } = render(<ContentArea />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('flex')
    expect(root.className).toContain('items-center')
    expect(root.className).toContain('justify-center')
  })

  it('falls back to the empty state when the selected tool no longer exists', () => {
    useServerStore.setState({
      servers: [server],
      selectedTool: { serverId: 'memory-mcp', toolName: 'gone' }
    })
    render(<ContentArea />)
    expect(screen.getByText('Ready when you are')).toBeInTheDocument()
  })
})

describe('ContentArea — tool detail', () => {
  it('renders the tool detail view for the selected tool', () => {
    useServerStore.setState({
      servers: [server],
      selectedTool: { serverId: 'memory-mcp', toolName: 'search_nodes' }
    })
    render(<ContentArea />)
    expect(screen.getByText('search_nodes')).toBeInTheDocument()
    expect(screen.getByText('Memory MCP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Execute' })).toBeInTheDocument()
  })
})

describe('ContentArea — server selected', () => {
  it('renders the server detail view for the selected server', () => {
    useServerStore.setState({ servers: [server], selectedServerId: 'memory-mcp' })
    render(<ContentArea />)
    expect(screen.getByRole('heading', { name: 'Memory MCP' })).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete server' })).toBeInTheDocument()
  })

  it('falls back to the empty state when the selected server no longer exists', () => {
    useServerStore.setState({ servers: [server], selectedServerId: 'gone' })
    render(<ContentArea />)
    expect(screen.getByText('Ready when you are')).toBeInTheDocument()
  })

  it('takes priority over the empty state but not over a selected tool', () => {
    useServerStore.setState({
      servers: [server],
      selectedServerId: 'memory-mcp',
      selectedTool: { serverId: 'memory-mcp', toolName: 'search_nodes' }
    })
    render(<ContentArea />)
    expect(screen.getByRole('button', { name: 'Execute' })).toBeInTheDocument()
  })
})

describe('ContentArea — resource detail', () => {
  it('renders the resource detail view for the selected resource', () => {
    useServerStore.setState({
      servers: [server],
      selectedResource: { serverId: 'memory-mcp', uri: 'memory://graph' }
    })
    render(<ContentArea />)
    expect(screen.getByText('Graph')).toBeInTheDocument()
    expect(screen.getByText('Memory MCP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument()
    // The uri is shown read-only.
    expect(screen.getByRole('textbox', { name: 'Resource URI' })).toBeDisabled()
  })

  it('falls back to the empty state when the selected resource no longer exists', () => {
    useServerStore.setState({
      servers: [server],
      selectedResource: { serverId: 'memory-mcp', uri: 'memory://gone' }
    })
    render(<ContentArea />)
    expect(screen.getByText('Ready when you are')).toBeInTheDocument()
  })
})
