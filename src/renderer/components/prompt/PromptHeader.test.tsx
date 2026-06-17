import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PromptHeader } from './PromptHeader'
import type { Prompt } from '../../../shared/mcp.types'

const basePrompt: Prompt = {
  name: 'summarize',
  description: 'Summarize a document',
  arguments: [{ name: 'topic', description: 'What to summarize', required: true }, { name: 'tone' }]
}

describe('PromptHeader', () => {
  it('renders the name, description, server and argument-count chips', () => {
    render(<PromptHeader prompt={basePrompt} serverName="Docs MCP" />)
    expect(screen.getByText('summarize')).toBeInTheDocument()
    expect(screen.getByText('Summarize a document')).toBeInTheDocument()
    expect(screen.getByText('Docs MCP')).toBeInTheDocument()
    expect(screen.getByText('2 arguments')).toBeInTheDocument()
  })

  it('singularizes the chip for a single argument', () => {
    render(
      <PromptHeader
        prompt={{ ...basePrompt, arguments: [{ name: 'topic' }] }}
        serverName="Docs MCP"
      />
    )
    expect(screen.getByText('1 argument')).toBeInTheDocument()
  })

  it('omits the argument chip when the prompt has no arguments', () => {
    render(<PromptHeader prompt={{ name: 'ping' }} serverName="Docs MCP" />)
    expect(screen.queryByText(/argument/)).not.toBeInTheDocument()
  })
})
