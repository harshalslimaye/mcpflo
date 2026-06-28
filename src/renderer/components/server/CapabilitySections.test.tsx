import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CapabilitySections } from './CapabilitySections'
import { useServerStore } from '../../stores/serverStore'
import type { MCPServer } from '../../../shared/mcp.types'

const base: MCPServer = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp/' },
  status: 'connected',
  tools: [
    {
      name: 'create_repository',
      description: 'Create a new repository.',
      inputSchema: { type: 'object' }
    }
  ],
  resources: [{ uri: 'repo://octocat/hello-world/tree', description: 'File tree.' }],
  prompts: [{ name: 'open_pr_review', description: 'Draft a review.' }]
}

const mockSelectTool = vi.fn()
const mockSelectResource = vi.fn()
const mockSelectPrompt = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useServerStore.setState({
    selectTool: mockSelectTool,
    selectResource: mockSelectResource,
    selectPrompt: mockSelectPrompt
  })
})

describe('CapabilitySections', () => {
  it('renders nothing when the server has no capabilities', () => {
    const { container } = render(
      <CapabilitySections server={{ ...base, tools: [], resources: [], prompts: [] }} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders all three section headers, expanded by default', () => {
    render(<CapabilitySections server={base} />)
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('Resources')).toBeInTheDocument()
    expect(screen.getByText('Prompts')).toBeInTheDocument()
    // Expanded by default — each section's item is already visible.
    expect(screen.getByText('create_repository')).toBeInTheDocument()
    expect(screen.getByText('repo://octocat/hello-world/tree')).toBeInTheDocument()
    expect(screen.getByText('open_pr_review')).toBeInTheDocument()
  })

  it('falls back to the uri when a resource has no name', () => {
    render(<CapabilitySections server={base} />)
    expect(screen.getByText('repo://octocat/hello-world/tree')).toBeInTheDocument()
  })

  it('prefers a resource’s friendly name over its uri', () => {
    render(
      <CapabilitySections
        server={{
          ...base,
          resources: [{ uri: 'repo://octocat/hello-world/tree', name: 'tree', description: 'x' }]
        }}
      />
    )
    expect(screen.getByText('tree')).toBeInTheDocument()
    expect(screen.queryByText('repo://octocat/hello-world/tree')).not.toBeInTheDocument()
  })

  it('selects a tool in the store when its row is clicked', () => {
    render(<CapabilitySections server={base} />)
    fireEvent.click(screen.getByText('create_repository'))
    expect(mockSelectTool).toHaveBeenCalledWith('github-mcp', 'create_repository')
  })

  it('selects a resource in the store when its row is clicked', () => {
    render(<CapabilitySections server={base} />)
    fireEvent.click(screen.getByText('repo://octocat/hello-world/tree'))
    expect(mockSelectResource).toHaveBeenCalledWith('github-mcp', 'repo://octocat/hello-world/tree')
  })

  it('selects a prompt in the store when its row is clicked', () => {
    render(<CapabilitySections server={base} />)
    fireEvent.click(screen.getByText('open_pr_review'))
    expect(mockSelectPrompt).toHaveBeenCalledWith('github-mcp', 'open_pr_review')
  })

  it('collapses and re-expands a section independently of the others', () => {
    render(<CapabilitySections server={base} />)
    fireEvent.click(screen.getByText('Tools'))
    expect(screen.queryByText('create_repository')).not.toBeInTheDocument()
    // The other sections stay expanded.
    expect(screen.getByText('repo://octocat/hello-world/tree')).toBeInTheDocument()
    expect(screen.getByText('open_pr_review')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Tools'))
    expect(screen.getByText('create_repository')).toBeInTheDocument()
  })

  it('disables a category with no items while the others stay interactive', () => {
    render(<CapabilitySections server={{ ...base, prompts: [] }} />)
    const promptsHeader = screen.getByText('Prompts').closest('button') as HTMLElement
    expect(promptsHeader).toBeDisabled()
    expect(screen.getByText('create_repository')).toBeInTheDocument()
  })
})
