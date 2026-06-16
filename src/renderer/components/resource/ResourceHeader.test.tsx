import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResourceHeader } from './ResourceHeader'
import type { Resource } from '../../../shared/mcp.types'

const baseResource: Resource = {
  uri: 'demo://readme',
  name: 'README',
  description: 'Project readme',
  mimeType: 'text/markdown'
}

describe('ResourceHeader', () => {
  it('renders the name, description, server and mime-type chips', () => {
    render(<ResourceHeader resource={baseResource} serverName="Docs MCP" />)
    expect(screen.getByText('README')).toBeInTheDocument()
    expect(screen.getByText('Project readme')).toBeInTheDocument()
    expect(screen.getByText('Docs MCP')).toBeInTheDocument()
    expect(screen.getByText('text/markdown')).toBeInTheDocument()
  })

  it('falls back to the uri when the resource has no name', () => {
    render(<ResourceHeader resource={{ ...baseResource, name: undefined }} serverName="Docs MCP" />)
    expect(screen.getByText('demo://readme')).toBeInTheDocument()
  })

  it('omits the mime-type chip when absent', () => {
    render(
      <ResourceHeader resource={{ ...baseResource, mimeType: undefined }} serverName="Docs MCP" />
    )
    expect(screen.queryByText('text/markdown')).not.toBeInTheDocument()
  })
})
