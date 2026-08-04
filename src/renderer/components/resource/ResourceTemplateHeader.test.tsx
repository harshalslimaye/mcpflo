import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResourceTemplateHeader } from './ResourceTemplateHeader'
import type { ResourceTemplate } from '../../../shared/mcp.types'

const baseTemplate: ResourceTemplate = {
  uriTemplate: 'demo://note/{id}',
  name: 'Note',
  description: 'A note by id',
  mimeType: 'text/markdown'
}

describe('ResourceTemplateHeader', () => {
  it('renders the name, description, server and mime-type chips', () => {
    render(<ResourceTemplateHeader template={baseTemplate} serverName="Docs MCP" />)
    expect(screen.getByText('Note')).toBeInTheDocument()
    expect(screen.getByText('A note by id')).toBeInTheDocument()
    expect(screen.getByText('Docs MCP')).toBeInTheDocument()
    expect(screen.getByText('text/markdown')).toBeInTheDocument()
  })

  it('shows the template alongside a name, so the shape stays visible', () => {
    render(<ResourceTemplateHeader template={baseTemplate} serverName="Docs MCP" />)
    expect(screen.getByText('demo://note/{id}')).toBeInTheDocument()
  })

  it('falls back to the template as the title when there is no name', () => {
    render(
      <ResourceTemplateHeader
        template={{ ...baseTemplate, name: undefined }}
        serverName="Docs MCP"
      />
    )
    // Once as the title, and not repeated as a chip.
    expect(screen.getAllByText('demo://note/{id}')).toHaveLength(1)
  })

  it('omits the mime-type chip when absent', () => {
    render(
      <ResourceTemplateHeader
        template={{ ...baseTemplate, mimeType: undefined }}
        serverName="Docs MCP"
      />
    )
    expect(screen.queryByText('text/markdown')).not.toBeInTheDocument()
  })
})
