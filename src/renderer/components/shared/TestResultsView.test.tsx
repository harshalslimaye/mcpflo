import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TestResultsView } from './TestResultsView'
import type { TestRunSummary } from '../../../shared/testing.types'

function summary(over: Partial<TestRunSummary>): TestRunSummary {
  return { results: [], passed: 0, failed: 0, total: 0, logs: [], durationMs: 1, ...over }
}

describe('TestResultsView — no test run', () => {
  it('shows teaching copy when summary is undefined', () => {
    render(<TestResultsView />)
    expect(screen.getByText(/Write a test script on the Tests tab/)).toBeInTheDocument()
  })
})

describe('TestResultsView — pass/fail summary', () => {
  it('shows the header counts and a row per test', () => {
    render(
      <TestResultsView
        summary={summary({
          results: [
            { name: 'passes', status: 'pass' },
            {
              name: 'fails',
              status: 'fail',
              error: 'expected 1 to equal 2',
              actual: '1',
              expected: '2'
            }
          ],
          passed: 1,
          failed: 1,
          total: 2
        })}
      />
    )
    expect(screen.getByText('Tests (2)')).toBeInTheDocument()
    expect(screen.getByText('Passed: 1')).toBeInTheDocument()
    expect(screen.getByText('Failed: 1')).toBeInTheDocument()
    expect(screen.getByText('passes')).toBeInTheDocument()
    expect(screen.getByText('fails')).toBeInTheDocument()
  })

  it('does not show a Failed count when nothing failed', () => {
    render(
      <TestResultsView
        summary={summary({ results: [{ name: 'a', status: 'pass' }], passed: 1, total: 1 })}
      />
    )
    expect(screen.queryByText(/Failed:/)).not.toBeInTheDocument()
  })

  it('expands a failing test to show its message and actual/expected', () => {
    render(
      <TestResultsView
        summary={summary({
          results: [
            {
              name: 'fails',
              status: 'fail',
              error: 'expected 1 to equal 2',
              actual: '1',
              expected: '2'
            }
          ],
          failed: 1,
          total: 1
        })}
      />
    )
    expect(screen.queryByText('expected 1 to equal 2')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /fails/ }))
    expect(screen.getByText('expected 1 to equal 2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('does not offer an expand affordance for a passing test', () => {
    render(
      <TestResultsView
        summary={summary({ results: [{ name: 'passes', status: 'pass' }], passed: 1, total: 1 })}
      />
    )
    const row = screen.getByText('passes').closest('button') as HTMLButtonElement
    expect(row).not.toHaveAttribute('aria-expanded')
  })
})

describe('TestResultsView — script errors', () => {
  it('shows a script-error banner distinct from the pass/fail rows', () => {
    render(
      <TestResultsView
        summary={summary({
          results: [{ name: 'first', status: 'pass' }],
          passed: 1,
          total: 1,
          scriptError: { type: 'syntax', message: 'Unexpected token' }
        })}
      />
    )
    expect(screen.getByText(/Script error — syntax/)).toBeInTheDocument()
    expect(screen.getByText('Unexpected token')).toBeInTheDocument()
    expect(screen.getByText('first')).toBeInTheDocument()
  })

  it('shows just the banner when the script failed before any test() ran', () => {
    render(
      <TestResultsView
        summary={summary({ scriptError: { type: 'syntax', message: 'Unexpected token' } })}
      />
    )
    expect(screen.getByText(/Script error/)).toBeInTheDocument()
    expect(screen.queryByText(/Tests \(/)).not.toBeInTheDocument()
  })
})

describe('TestResultsView — empty script run', () => {
  it('shows teaching copy when the script ran but called no test()', () => {
    render(<TestResultsView summary={summary({})} />)
    expect(screen.getByText(/didn't call test\(\)/)).toBeInTheDocument()
  })
})

describe('TestResultsView — console logs', () => {
  it('is absent when there are no logs', () => {
    render(
      <TestResultsView
        summary={summary({ results: [{ name: 'a', status: 'pass' }], passed: 1, total: 1 })}
      />
    )
    expect(screen.queryByText(/Console/)).not.toBeInTheDocument()
  })

  it('shows a collapsed count and expands to the joined log lines', () => {
    render(
      <TestResultsView
        summary={summary({
          results: [{ name: 'a', status: 'pass' }],
          passed: 1,
          total: 1,
          logs: ['first', 'second 42']
        })}
      />
    )
    expect(screen.getByText('Console (2)')).toBeInTheDocument()
    expect(screen.queryByText('first')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Console/ }))
    expect(screen.getByText('first', { exact: false })).toBeInTheDocument()
  })
})
