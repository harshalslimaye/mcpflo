import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ServerTestsTab } from './ServerTestsTab'
import { useServerStore, testsTabKey } from '../../stores/serverStore'
import type { MCPServer } from '../../../shared/mcp.types'

const base: MCPServer = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp/' },
  status: 'connected',
  tools: [{ name: 'create_issue', inputSchema: { type: 'object' } }],
  resources: [{ uri: 'repo://tree' }],
  resourceTemplates: [],
  prompts: [{ name: 'summarize' }]
}

const mockRunCapabilityTests = vi.fn()
const mockRunAllTests = vi.fn().mockResolvedValue(undefined)
const mockOnScriptedChange = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useServerStore.setState({
    testsTabRuns: {},
    runCapabilityTests: mockRunCapabilityTests,
    runAllTests: mockRunAllTests
  })
  ;(globalThis as Record<string, unknown>).api = {
    testing: { listScripts: vi.fn().mockResolvedValue([]) }
  }
})

describe('ServerTestsTab', () => {
  it('renders nothing when the server has no capabilities', () => {
    const { container } = render(
      <ServerTestsTab
        server={{ ...base, tools: [], resources: [], prompts: [] }}
        scripted={new Set()}
        onScriptedChange={mockOnScriptedChange}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  // Resource templates are deliberately absent from this tab: they have no test
  // scripts, so counting them would report "0 of N passed" against capabilities
  // that can never pass. Keep them out of both the rows and the totals.
  it('ignores resource templates entirely', () => {
    const withTemplates = { ...base, resourceTemplates: [{ uriTemplate: 'repo://{owner}/tree' }] }
    render(
      <ServerTestsTab
        server={withTemplates}
        scripted={new Set()}
        onScriptedChange={mockOnScriptedChange}
      />
    )
    expect(screen.queryByText('repo://{owner}/tree')).not.toBeInTheDocument()
    expect(screen.queryByText('Resource Templates')).not.toBeInTheDocument()
  })

  it('renders nothing when the only capabilities are resource templates', () => {
    const { container } = render(
      <ServerTestsTab
        server={{
          ...base,
          tools: [],
          resources: [],
          prompts: [],
          resourceTemplates: [{ uriTemplate: 'repo://{owner}/tree' }]
        }}
        scripted={new Set()}
        onScriptedChange={mockOnScriptedChange}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders every capability grouped by category', () => {
    render(
      <ServerTestsTab server={base} scripted={new Set()} onScriptedChange={mockOnScriptedChange} />
    )
    expect(screen.getByText('create_issue')).toBeInTheDocument()
    expect(screen.getByText('repo://tree')).toBeInTheDocument()
    expect(screen.getByText('summarize')).toBeInTheDocument()
  })

  it('shows "No test script" and no Run button for a capability with no saved script', () => {
    render(
      <ServerTestsTab server={base} scripted={new Set()} onScriptedChange={mockOnScriptedChange} />
    )
    // All three fixture capabilities are un-scripted here.
    expect(screen.getAllByText('No test script')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Run create_issue' })).not.toBeInTheDocument()
  })

  it('shows "Not tested" and a Run button for a scripted capability with no run yet', () => {
    render(
      <ServerTestsTab
        server={base}
        scripted={new Set(['tool::create_issue'])}
        onScriptedChange={mockOnScriptedChange}
      />
    )
    expect(screen.getByText('Not tested')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run create_issue' })).toBeInTheDocument()
  })

  it("calls runCapabilityTests when a row's Run button is clicked", () => {
    render(
      <ServerTestsTab
        server={base}
        scripted={new Set(['tool::create_issue'])}
        onScriptedChange={mockOnScriptedChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Run create_issue' }))
    expect(mockRunCapabilityTests).toHaveBeenCalledWith('github-mcp', 'tool', 'create_issue')
  })

  it('shows a running indicator while a capability is running', () => {
    useServerStore.setState({
      testsTabRuns: { [testsTabKey('github-mcp', 'tool', 'create_issue')]: { state: 'running' } }
    })
    render(
      <ServerTestsTab
        server={base}
        scripted={new Set(['tool::create_issue'])}
        onScriptedChange={mockOnScriptedChange}
      />
    )
    expect(screen.getByText('Running…')).toBeInTheDocument()
  })

  it('shows a skipped indicator when a capability could not be auto-invoked', () => {
    useServerStore.setState({
      testsTabRuns: { [testsTabKey('github-mcp', 'tool', 'create_issue')]: { state: 'skipped' } }
    })
    render(
      <ServerTestsTab
        server={base}
        scripted={new Set(['tool::create_issue'])}
        onScriptedChange={mockOnScriptedChange}
      />
    )
    expect(screen.getByText('Skipped — needs input')).toBeInTheDocument()
  })

  it('shows pass/fail counts and expands to the per-test rows for a completed run', () => {
    useServerStore.setState({
      testsTabRuns: {
        [testsTabKey('github-mcp', 'tool', 'create_issue')]: {
          state: 'done',
          summary: {
            results: [
              { name: 'creates ok', status: 'pass' },
              { name: 'rejects dup', status: 'fail', error: 'boom' }
            ],
            passed: 1,
            failed: 1,
            total: 2,
            logs: [],
            durationMs: 3
          }
        }
      }
    })
    render(
      <ServerTestsTab
        server={base}
        scripted={new Set(['tool::create_issue'])}
        onScriptedChange={mockOnScriptedChange}
      />
    )
    // Row status and the header aggregate coincide here (only one done run),
    // so each renders twice.
    expect(screen.getAllByText('1 passed')).toHaveLength(2)
    expect(screen.getAllByText('1 failed')).toHaveLength(2)
    expect(screen.queryByText('creates ok')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('create_issue'))
    expect(screen.getByText('creates ok')).toBeInTheDocument()
    expect(screen.getByText('rejects dup')).toBeInTheDocument()
  })

  it("shows the aggregate summary only for this server's completed runs", () => {
    useServerStore.setState({
      testsTabRuns: {
        [testsTabKey('github-mcp', 'tool', 'create_issue')]: {
          state: 'done',
          summary: { results: [], passed: 2, failed: 1, total: 3, logs: [], durationMs: 1 }
        },
        // A different server's run must not bleed into this one's aggregate.
        [testsTabKey('other-mcp', 'tool', 'x')]: {
          state: 'done',
          summary: { results: [], passed: 10, failed: 10, total: 20, logs: [], durationMs: 1 }
        }
      }
    })
    render(
      <ServerTestsTab
        server={base}
        scripted={new Set(['tool::create_issue'])}
        onScriptedChange={mockOnScriptedChange}
      />
    )
    // "3 tests" only appears in the aggregate header — the row itself only
    // shows pass/fail, not a total — so this alone confirms the other
    // server's 20-test run didn't bleed into this server's aggregate.
    expect(screen.getByText('3 tests')).toBeInTheDocument()
    expect(screen.getAllByText('2 passed')).toHaveLength(2)
    expect(screen.getAllByText('1 failed')).toHaveLength(2)
  })

  it('disables Run all tests until the scripted set has loaded', () => {
    render(
      <ServerTestsTab server={base} scripted={undefined} onScriptedChange={mockOnScriptedChange} />
    )
    expect(screen.getByRole('button', { name: /Run all tests/ })).toBeDisabled()
  })

  it('calls runAllTests when Run all tests is clicked', async () => {
    render(
      <ServerTestsTab server={base} scripted={new Set()} onScriptedChange={mockOnScriptedChange} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Run all tests/ }))
    expect(mockRunAllTests).toHaveBeenCalledWith('github-mcp')
  })
})
