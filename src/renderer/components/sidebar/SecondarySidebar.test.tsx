import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SecondarySidebar } from './SecondarySidebar'

describe('SecondarySidebar', () => {
  it('renders section title', () => {
    render(<SecondarySidebar />)
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
  })

  it('renders Add Server button', () => {
    render(<SecondarySidebar />)
    expect(screen.getByText('+ Add Server')).toBeInTheDocument()
  })

  it('renders all three server names', () => {
    render(<SecondarySidebar />)
    expect(screen.getByText('GitHub MCP')).toBeInTheDocument()
    expect(screen.getByText('Slack MCP')).toBeInTheDocument()
    expect(screen.getByText('PostgreSQL MCP')).toBeInTheDocument()
  })

  it('renders correct tool counts for GitHub MCP', () => {
    render(<SecondarySidebar />)
    const rows = screen.getAllByText('Tools')
    // GitHub MCP is first — sibling count cell should be 4
    expect(rows[0].nextSibling?.textContent).toBe('4')
  })

  it('renders correct tool counts for Slack MCP', () => {
    render(<SecondarySidebar />)
    const rows = screen.getAllByText('Tools')
    expect(rows[1].nextSibling?.textContent).toBe('6')
  })

  it('renders correct tool counts for PostgreSQL MCP', () => {
    render(<SecondarySidebar />)
    const rows = screen.getAllByText('Tools')
    expect(rows[2].nextSibling?.textContent).toBe('3')
  })

  it('renders Resources and Prompts labels for each server', () => {
    render(<SecondarySidebar />)
    expect(screen.getAllByText('Resources')).toHaveLength(3)
    expect(screen.getAllByText('Prompts')).toHaveLength(3)
  })

  it('renders chevron icon for each server', () => {
    const { container } = render(<SecondarySidebar />)
    // One ChevronRight SVG per server
    expect(container.querySelectorAll('svg')).toHaveLength(3)
  })
})
