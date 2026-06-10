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
  resources: [],
  prompts: []
}

beforeEach(() => {
  useServerStore.setState({ servers: [], selectedServerId: null, selectedTool: null })
})

describe('ContentArea — empty state', () => {
  it('renders primary empty state text', () => {
    render(<ContentArea />)
    expect(screen.getByText('Select an MCP Server')).toBeInTheDocument()
  })

  it('renders secondary empty state text', () => {
    render(<ContentArea />)
    expect(screen.getByText('or tool to get started')).toBeInTheDocument()
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
    expect(screen.getByText('Select an MCP Server')).toBeInTheDocument()
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
