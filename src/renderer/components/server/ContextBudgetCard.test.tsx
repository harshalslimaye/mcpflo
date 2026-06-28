import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContextBudgetCard } from './ContextBudgetCard'
import { computeContextBudget } from '../../lib/contextBudget'
import type { MCPServer } from '../../../shared/mcp.types'

const base: MCPServer = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp/' },
  status: 'connected',
  tools: [
    {
      name: 'create_repository',
      description: 'Create a new repository in your account or an organization.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, private: { type: 'boolean' } },
        required: ['name']
      }
    },
    {
      name: 'create_pull_request',
      description: 'Open a pull request between two branches.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          base: { type: 'string' },
          head: { type: 'string' }
        }
      }
    }
  ],
  resources: [
    {
      uri: 'repo://octocat/hello-world/tree',
      name: 'tree',
      description: 'File tree of the default branch.'
    }
  ],
  prompts: [
    {
      name: 'open_pr_review',
      description: 'Draft a structured review for a pull request.',
      arguments: [{ name: 'pr', description: 'PR number', required: true }]
    }
  ]
}

// Helper: a server's exact expected formatting, derived from the same utility
// the component uses — keeps assertions correct even if token estimates shift
// with the tokenizer, since both sides compute from the same input.
function expected(server: Pick<MCPServer, 'tools' | 'resources' | 'prompts'>): {
  budget: ReturnType<typeof computeContextBudget>
  totalTokens: string
  windowPercent: string
} {
  const budget = computeContextBudget(server)
  return {
    budget,
    totalTokens: `~${budget.total.tokens.toLocaleString()}`,
    windowPercent: `${(budget.windowFraction * 100).toFixed(2)}%`
  }
}

describe('ContextBudgetCard', () => {
  it('renders nothing when the server has no capabilities', () => {
    const { container } = render(
      <ContextBudgetCard server={{ ...base, tools: [], resources: [], prompts: [] }} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the total token estimate (header chip and the Total row agree)', () => {
    const { totalTokens } = expected(base)
    render(<ContextBudgetCard server={base} />)
    expect(screen.getAllByText(totalTokens)).toHaveLength(2)
    expect(screen.getByText('tokens')).toBeInTheDocument()
  })

  it('renders a row per category with its item count', () => {
    render(<ContextBudgetCard server={base} />)
    const rows = [
      ['Tools', '2'],
      ['Resources', '1'],
      ['Prompts', '1']
    ]
    for (const [label, count] of rows) {
      const row = screen.getByText(label).closest('div') as HTMLElement
      expect(row).toHaveTextContent(count)
    }
  })

  it('renders the Total row with the combined count and tokens', () => {
    const { budget, totalTokens } = expected(base)
    render(<ContextBudgetCard server={base} />)
    const totalRow = screen.getByText('Total').parentElement as HTMLElement
    expect(totalRow).toHaveTextContent(String(budget.total.count))
    expect(totalRow).toHaveTextContent(totalTokens)
    expect(totalRow).toHaveTextContent('100%')
  })

  it('renders the 200K-window footprint as a percentage', () => {
    const { windowPercent } = expected(base)
    render(<ContextBudgetCard server={base} />)
    expect(screen.getByText('200K-token')).toBeInTheDocument()
    expect(screen.getByText(windowPercent)).toBeInTheDocument()
  })

  it('shows a dash for a category average when it has no items', () => {
    render(<ContextBudgetCard server={{ ...base, prompts: [] }} />)
    const promptsRow = screen.getByText('Prompts').closest('div') as HTMLElement
    expect(promptsRow).toHaveTextContent('—')
  })

  it('renders one bar segment per non-empty category', () => {
    const { container } = render(<ContextBudgetCard server={base} />)
    const bar = container.querySelector('.rounded-full.bg-bg-elevated') as HTMLElement
    expect(bar.children).toHaveLength(3)
  })

  it('omits a bar segment for an empty category', () => {
    const { container } = render(<ContextBudgetCard server={{ ...base, prompts: [] }} />)
    const bar = container.querySelector('.rounded-full.bg-bg-elevated') as HTMLElement
    expect(bar.children).toHaveLength(2)
  })

  it('renders the estimation disclaimer', () => {
    render(<ContextBudgetCard server={base} />)
    expect(screen.getByText('~ Estimated')).toBeInTheDocument()
  })
})
