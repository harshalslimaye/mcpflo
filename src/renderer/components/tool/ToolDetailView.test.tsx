import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToolDetailView } from './ToolDetailView'
import { useServerStore, toolKey, type ToolCallRecord } from '../../stores/serverStore'
import type { Tool } from '../../../shared/mcp.types'

const tool: Tool = {
  name: 'search_nodes',
  description: 'Search the graph',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  }
}

beforeEach(() => {
  useServerStore.setState({ history: {} })
})

describe('ToolDetailView', () => {
  it('renders the header and defaults to the Params tab', () => {
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    expect(screen.getByText('search_nodes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Execute' })).toBeInTheDocument()
  })

  it('shows the History panel on the right rail (not as a tab)', () => {
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    // History is always visible without switching tabs…
    expect(screen.getByText('No calls yet.')).toBeInTheDocument()
    // …and is no longer one of the tab buttons.
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument()
  })

  it('switches to the Schema tab and shows the raw schema', () => {
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.click(screen.getByRole('button', { name: 'Schema' }))
    expect(screen.getByText(/"query"/)).toBeInTheDocument()
  })

  it('keeps the History panel visible on the Schema tab', () => {
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.click(screen.getByRole('button', { name: 'Schema' }))
    expect(screen.getByText('No calls yet.')).toBeInTheDocument()
  })

  it('lists recorded calls in the History rail', () => {
    const record: ToolCallRecord = {
      id: '1',
      serverId: 'memory-mcp',
      toolName: 'search_nodes',
      args: { query: 'hi' },
      status: 'success',
      result: { content: [{ type: 'text', text: 'ok' }] },
      durationMs: 9,
      at: Date.now()
    }
    useServerStore.setState({ history: { [toolKey('memory-mcp', 'search_nodes')]: [record] } })
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    expect(screen.queryByText('No calls yet.')).not.toBeInTheDocument()
    // The args summary is rendered in the rail entry (the result panel shows
    // the output, not the args), so it uniquely identifies the history list.
    expect(screen.getByText('{"query":"hi"}')).toBeInTheDocument()
  })

  it('preserves Params form state across tab switches', () => {
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'kept' } })
    fireEvent.click(screen.getByRole('button', { name: 'Schema' }))
    fireEvent.click(screen.getByRole('button', { name: 'Params' }))
    expect((screen.getByRole('textbox', { name: 'query' }) as HTMLInputElement).value).toBe('kept')
  })

  it('renders header badges for a tool that declares all annotation hints', () => {
    const annotated: Tool = {
      name: 'delete_node',
      description: 'Remove a node from the graph',
      inputSchema: { type: 'object', properties: {}, required: [] },
      annotations: { readOnlyHint: true, destructiveHint: true, idempotentHint: true }
    }
    render(<ToolDetailView tool={annotated} serverId="memory-mcp" serverName="Memory MCP" />)
    expect(screen.getByText('Read-only')).toBeInTheDocument()
    expect(screen.getByText('Idempotent')).toBeInTheDocument()
    expect(screen.getByText('Destructive').className).toMatch(/red/)
  })

  it('renders the destructive badge for a tool that only declares destructiveHint', () => {
    const destructive: Tool = {
      name: 'drop_table',
      inputSchema: { type: 'object', properties: {}, required: [] },
      annotations: { destructiveHint: true }
    }
    render(<ToolDetailView tool={destructive} serverId="db-mcp" serverName="DB MCP" />)
    expect(screen.getByText('Destructive')).toBeInTheDocument()
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument()
    expect(screen.queryByText('Idempotent')).not.toBeInTheDocument()
  })
})
