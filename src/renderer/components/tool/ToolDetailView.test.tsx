import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    // The rail defaults to the global "All" tab; the tool's own history lives
    // under "This tool".
    fireEvent.click(screen.getByRole('button', { name: 'This tool' }))
    expect(screen.getByText('No calls yet.')).toBeInTheDocument()
    // History is the right rail, not one of the Request (Params/Schema) tabs.
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument()
  })

  it('switches to the Schema tab and shows the raw schema', () => {
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.click(screen.getByRole('button', { name: 'Schema' }))
    expect(screen.getByText(/"query"/)).toBeInTheDocument()
  })

  it('keeps the History panel visible on the Schema tab', () => {
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.click(screen.getByRole('button', { name: 'This tool' }))
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
      notifications: [],
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

  it('shows the history count and clears it with the clear button', () => {
    const record: ToolCallRecord = {
      id: '1',
      serverId: 'memory-mcp',
      toolName: 'search_nodes',
      args: { query: 'hi' },
      status: 'success',
      notifications: [],
      durationMs: 9,
      at: Date.now()
    }
    useServerStore.setState({ history: { [toolKey('memory-mcp', 'search_nodes')]: [record] } })
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.click(screen.getByRole('button', { name: 'This tool' }))
    expect(screen.getByText('1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByText('No calls yet.')).toBeInTheDocument()
  })

  it('preserves Params form state across tab switches', () => {
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'kept' } })
    fireEvent.click(screen.getByRole('button', { name: 'Schema' }))
    fireEvent.click(screen.getByRole('button', { name: 'Params' }))
    expect((screen.getByRole('textbox', { name: 'query' }) as HTMLInputElement).value).toBe('kept')
  })

  it('pre-fills the Params form when a History entry is clicked', () => {
    const record: ToolCallRecord = {
      id: '1',
      serverId: 'memory-mcp',
      toolName: 'search_nodes',
      args: { query: 'from history' },
      status: 'success',
      notifications: [],
      durationMs: 9,
      at: Date.now()
    }
    useServerStore.setState({ history: { [toolKey('memory-mcp', 'search_nodes')]: [record] } })
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.click(screen.getByRole('button', { name: 'This tool' }))
    fireEvent.click(screen.getByText('{"query":"from history"}'))
    expect((screen.getByRole('textbox', { name: 'query' }) as HTMLInputElement).value).toBe(
      'from history'
    )
  })

  it('keeps History entries clickable even when the tool takes no parameters', () => {
    const noParamTool: Tool = {
      name: 'ping',
      inputSchema: { type: 'object', properties: {} }
    }
    const record: ToolCallRecord = {
      id: '1',
      serverId: 'memory-mcp',
      toolName: 'ping',
      args: {},
      status: 'success',
      notifications: [],
      durationMs: 3,
      at: Date.now()
    }
    useServerStore.setState({ history: { [toolKey('memory-mcp', 'ping')]: [record] } })
    render(<ToolDetailView tool={noParamTool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.click(screen.getByRole('button', { name: 'This tool' }))
    // Even with no form to pre-fill, the entry is interactive so selecting it can
    // drive the Response panel — clicking it must not throw (no prefill path).
    const entry = screen.getByRole('button', { name: /no arguments/ })
    fireEvent.click(entry)
    expect(entry).toHaveAttribute('aria-current', 'true')
  })

  it('shows the selected history entry’s response in the Response panel', () => {
    const newest: ToolCallRecord = {
      id: 'new',
      serverId: 'memory-mcp',
      toolName: 'search_nodes',
      args: { query: 'new' },
      status: 'success',
      response: {
        jsonrpc: '2.0',
        id: 2,
        result: { content: [{ type: 'text', text: 'NEW RESULT' }] }
      },
      notifications: [],
      durationMs: 9,
      at: Date.now()
    }
    const older: ToolCallRecord = {
      ...newest,
      id: 'old',
      args: { query: 'old' },
      response: {
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'OLD RESULT' }] }
      }
    }
    useServerStore.setState({
      history: { [toolKey('memory-mcp', 'search_nodes')]: [newest, older] }
    })
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.click(screen.getByRole('button', { name: 'This tool' }))
    // The dock is minimized by default, so the response body is hidden on load…
    expect(screen.queryByText('NEW RESULT')).not.toBeInTheDocument()
    // …expanding it reveals the latest call's response…
    fireEvent.click(screen.getByLabelText('Expand response'))
    expect(screen.getByText('NEW RESULT')).toBeInTheDocument()
    // …and clicking the older entry swaps the panel to that record's response.
    fireEvent.click(screen.getByText('{"query":"old"}'))
    expect(screen.getByText('OLD RESULT')).toBeInTheDocument()
    expect(screen.queryByText('NEW RESULT')).not.toBeInTheDocument()
  })

  it('snaps the Response panel back to the latest call after executing', async () => {
    const newest: ToolCallRecord = {
      id: 'new',
      serverId: 'memory-mcp',
      toolName: 'search_nodes',
      args: { query: 'new' },
      status: 'success',
      response: {
        jsonrpc: '2.0',
        id: 2,
        result: { content: [{ type: 'text', text: 'NEW RESULT' }] }
      },
      notifications: [],
      durationMs: 9,
      at: Date.now()
    }
    const older: ToolCallRecord = {
      ...newest,
      id: 'old',
      args: { query: 'old' },
      response: {
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'OLD RESULT' }] }
      }
    }
    useServerStore.setState({
      history: { [toolKey('memory-mcp', 'search_nodes')]: [newest, older] }
    })
    render(<ToolDetailView tool={tool} serverId="memory-mcp" serverName="Memory MCP" />)
    fireEvent.click(screen.getByRole('button', { name: 'This tool' }))
    // Pin the older entry, then run a new call (executeTool no-ops with no server
    // registered, so history is unchanged) — the panel should drop the selection.
    fireEvent.click(screen.getByText('{"query":"old"}'))
    expect(screen.getByText('OLD RESULT')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    await waitFor(() => expect(screen.getByText('NEW RESULT')).toBeInTheDocument())
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
