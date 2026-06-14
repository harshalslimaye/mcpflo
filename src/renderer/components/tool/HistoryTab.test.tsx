import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HistoryTab } from './HistoryTab'
import type { ToolCallRecord } from '../../stores/serverStore'

function rec(over: Partial<ToolCallRecord>): ToolCallRecord {
  return {
    id: 'r1',
    serverId: 'srv',
    toolName: 'echo',
    args: { q: 'hi' },
    status: 'success',
    durationMs: 10,
    at: Date.now(),
    ...over
  }
}

describe('HistoryTab', () => {
  it('renders the empty state copy', () => {
    render(<HistoryTab />)
    expect(screen.getByText('No calls yet.')).toBeInTheDocument()
  })

  it('summarizes empty args as "no arguments"', () => {
    render(<HistoryTab records={[rec({ args: {} })]} />)
    expect(screen.getByText('no arguments')).toBeInTheDocument()
  })

  it('shows a red status dot for error records and green for success', () => {
    const { container } = render(
      <HistoryTab records={[rec({ id: 'ok' }), rec({ id: 'bad', status: 'error' })]} />
    )
    expect(container.querySelector('.bg-green-500')).not.toBeNull()
    expect(container.querySelector('.bg-red-500')).not.toBeNull()
  })

  it('calls onSelectRecord with the clicked record when interactive', () => {
    const onSelectRecord = vi.fn()
    const record = rec({ id: 'r1', args: { message: 'hello' } })
    render(<HistoryTab records={[record]} onSelectRecord={onSelectRecord} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelectRecord).toHaveBeenCalledWith(record)
  })

  it('renders entries as non-interactive when no onSelectRecord is given', () => {
    render(<HistoryTab records={[rec({})]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
