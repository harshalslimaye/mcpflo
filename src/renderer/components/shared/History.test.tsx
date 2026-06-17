import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { History, type HistoryRecord } from './History'

function rec(over: Partial<HistoryRecord>): HistoryRecord {
  return {
    id: 'r1',
    status: 'success',
    durationMs: 10,
    at: Date.now(),
    ...over
  }
}

describe('History', () => {
  it('renders the provided empty-state copy', () => {
    render(<History emptyLabel="No reads yet." />)
    expect(screen.getByText('No reads yet.')).toBeInTheDocument()
  })

  it('shows the duration for a recorded entry', () => {
    render(<History records={[rec({ durationMs: 17 })]} emptyLabel="empty" />)
    expect(screen.getByText('17 ms')).toBeInTheDocument()
  })

  it('shows a red status dot for errors and green for success', () => {
    const { container } = render(
      <History
        records={[rec({ id: 'ok' }), rec({ id: 'bad', status: 'error' })]}
        emptyLabel="empty"
      />
    )
    expect(container.querySelector('.bg-green')).not.toBeNull()
    expect(container.querySelector('.bg-red-500')).not.toBeNull()
  })

  it('renders a detail line via renderDetail', () => {
    render(
      <History
        records={[rec({})]}
        emptyLabel="empty"
        renderDetail={() => <span>detail line</span>}
      />
    )
    expect(screen.getByText('detail line')).toBeInTheDocument()
  })

  it('calls onSelectRecord with the clicked record when interactive', () => {
    const onSelectRecord = vi.fn()
    const record = rec({ id: 'r1' })
    render(<History records={[record]} emptyLabel="empty" onSelectRecord={onSelectRecord} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelectRecord).toHaveBeenCalledWith(record)
  })

  it('renders entries as non-interactive when no onSelectRecord is given', () => {
    render(<History records={[rec({})]} emptyLabel="empty" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('marks the entry matching selectedId as current', () => {
    render(
      <History
        records={[rec({ id: 'a' }), rec({ id: 'b' })]}
        emptyLabel="empty"
        onSelectRecord={vi.fn()}
        selectedId="b"
      />
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).not.toHaveAttribute('aria-current')
    expect(buttons[1]).toHaveAttribute('aria-current', 'true')
  })
})
