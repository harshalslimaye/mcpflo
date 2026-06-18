import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResultPanel } from './ResultPanel'

const tabs = [
  { key: 'preview' as const, label: 'Preview' },
  { key: 'raw' as const, label: 'Raw' }
]

describe('ResultPanel', () => {
  it('shows the busy label when busy with no record', () => {
    render(
      <ResultPanel busyLabel="Reading…" busy tabs={tabs} activeTab="preview" onTabChange={vi.fn()}>
        body
      </ResultPanel>
    )
    expect(screen.getByText('Reading…')).toBeInTheDocument()
    expect(screen.queryByText('Success')).not.toBeInTheDocument()
  })

  it('shows the idle state when not busy and no record', () => {
    render(
      <ResultPanel busyLabel="Reading…" tabs={tabs} activeTab="preview" onTabChange={vi.fn()}>
        body
      </ResultPanel>
    )
    expect(screen.getByText('Idle')).toBeInTheDocument()
    expect(screen.queryByText('Reading…')).not.toBeInTheDocument()
    expect(screen.queryByText('Success')).not.toBeInTheDocument()
  })

  it('shows status and duration when a record is present', () => {
    render(
      <ResultPanel
        busyLabel="Reading…"
        record={{ status: 'success', durationMs: 42 }}
        tabs={tabs}
        activeTab="preview"
        onTabChange={vi.fn()}
      >
        body
      </ResultPanel>
    )
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByText('42 ms')).toBeInTheDocument()
    expect(screen.queryByText('Reading…')).not.toBeInTheDocument()
  })

  it('shows an error treatment for error records', () => {
    render(
      <ResultPanel
        busyLabel="Reading…"
        record={{ status: 'error', durationMs: 5 }}
        tabs={tabs}
        activeTab="preview"
        onTabChange={vi.fn()}
      >
        body
      </ResultPanel>
    )
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByLabelText('Error icon')).toBeInTheDocument()
  })

  it('renders a count badge only when count > 0', () => {
    const { rerender } = render(
      <ResultPanel
        busyLabel="x"
        tabs={[{ key: 'notes' as const, label: 'Notifications', count: 0 }]}
        activeTab="notes"
        onTabChange={vi.fn()}
      >
        body
      </ResultPanel>
    )
    expect(screen.queryByText('(0)')).not.toBeInTheDocument()

    rerender(
      <ResultPanel
        busyLabel="x"
        tabs={[{ key: 'notes' as const, label: 'Notifications', count: 3 }]}
        activeTab="notes"
        onTabChange={vi.fn()}
      >
        body
      </ResultPanel>
    )
    expect(screen.getByText('(3)')).toBeInTheDocument()
  })

  it('calls onTabChange with the clicked tab key', () => {
    const onTabChange = vi.fn()
    render(
      <ResultPanel busyLabel="x" tabs={tabs} activeTab="preview" onTabChange={onTabChange}>
        body
      </ResultPanel>
    )
    fireEvent.click(screen.getByText('Raw'))
    expect(onTabChange).toHaveBeenCalledWith('raw')
  })

  it('renders its children as the body', () => {
    render(
      <ResultPanel busyLabel="x" tabs={tabs} activeTab="preview" onTabChange={vi.fn()}>
        <span>the body</span>
      </ResultPanel>
    )
    expect(screen.getByText('the body')).toBeInTheDocument()
  })
})
