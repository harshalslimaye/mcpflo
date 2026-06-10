import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToolHeader } from './ToolHeader'
import type { Tool } from '../../../shared/mcp.types'

const baseTool: Tool = {
  name: 'search_nodes',
  description: 'Search the knowledge graph',
  inputSchema: { type: 'object' }
}

describe('ToolHeader', () => {
  it('renders the tool name, description and server badge', () => {
    render(<ToolHeader tool={baseTool} serverName="Memory MCP" />)
    expect(screen.getByText('search_nodes')).toBeInTheDocument()
    expect(screen.getByText('Search the knowledge graph')).toBeInTheDocument()
    expect(screen.getByText('Memory MCP')).toBeInTheDocument()
  })

  it('omits the description paragraph when absent', () => {
    const { container } = render(
      <ToolHeader tool={{ ...baseTool, description: undefined }} serverName="Memory MCP" />
    )
    expect(container.querySelector('p')).not.toBeInTheDocument()
  })

  it('renders annotation badges that are true', () => {
    render(
      <ToolHeader
        tool={{ ...baseTool, annotations: { readOnlyHint: true, idempotentHint: true } }}
        serverName="Memory MCP"
      />
    )
    expect(screen.getByText('Read-only')).toBeInTheDocument()
    expect(screen.getByText('Idempotent')).toBeInTheDocument()
    expect(screen.queryByText('Destructive')).not.toBeInTheDocument()
  })

  it('renders a destructive badge with a red treatment', () => {
    render(
      <ToolHeader
        tool={{ ...baseTool, annotations: { destructiveHint: true } }}
        serverName="Memory MCP"
      />
    )
    const badge = screen.getByText('Destructive')
    expect(badge.className).toMatch(/red/)
  })

  it('renders no badges when annotations are absent', () => {
    render(<ToolHeader tool={baseTool} serverName="Memory MCP" />)
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument()
    expect(screen.queryByText('Destructive')).not.toBeInTheDocument()
    expect(screen.queryByText('Idempotent')).not.toBeInTheDocument()
  })

  it('ignores hints that are explicitly false', () => {
    render(
      <ToolHeader
        tool={{ ...baseTool, annotations: { readOnlyHint: false, destructiveHint: false } }}
        serverName="Memory MCP"
      />
    )
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument()
    expect(screen.queryByText('Destructive')).not.toBeInTheDocument()
  })
})
