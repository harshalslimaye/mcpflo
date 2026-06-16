import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HistoryRail } from './HistoryRail'

describe('HistoryRail', () => {
  it('renders the History title and its children', () => {
    render(
      <HistoryRail count={0} onClear={vi.fn()}>
        <div>list body</div>
      </HistoryRail>
    )
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByText('list body')).toBeInTheDocument()
  })

  it('shows the count pill and clear button when count > 0', () => {
    render(
      <HistoryRail count={3} onClear={vi.fn()}>
        body
      </HistoryRail>
    )
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'clear' })).toBeInTheDocument()
  })

  it('hides the count pill and clear button when count is 0', () => {
    render(
      <HistoryRail count={0} onClear={vi.fn()}>
        body
      </HistoryRail>
    )
    expect(screen.queryByRole('button', { name: 'clear' })).not.toBeInTheDocument()
  })

  it('calls onClear when clear is clicked', () => {
    const onClear = vi.fn()
    render(
      <HistoryRail count={2} onClear={onClear}>
        body
      </HistoryRail>
    )
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})
