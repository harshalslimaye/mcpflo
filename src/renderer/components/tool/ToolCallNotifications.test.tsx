import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationsTab } from './ToolCallNotifications'
import type { ToolCallNotification } from '../../../shared/mcp.types'

function progress(p: number, total?: number, message?: string): ToolCallNotification {
  return {
    method: 'notifications/progress',
    params: { progress: p, ...(total !== undefined && { total }), ...(message && { message }) },
    at: 1700000000000
  }
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true
  })
})

describe('NotificationsTab', () => {
  it('shows the teaching empty state when there are no notifications', () => {
    render(<NotificationsTab notifications={[]} />)
    expect(screen.getByText(/No notifications were received during this call/)).toBeInTheDocument()
    expect(
      screen.getByText(/progress updates, log messages, or resource updates/)
    ).toBeInTheDocument()
  })

  it('uses present-tense wording for the empty state of a running call', () => {
    render(<NotificationsTab notifications={[]} live />)
    expect(screen.getByText(/No notifications received yet/)).toBeInTheDocument()
  })

  it('renders one collapsed panel per notification', () => {
    render(<NotificationsTab notifications={[progress(1, 5), progress(2, 5)]} />)
    const toggles = screen.getAllByRole('button', { expanded: false })
    expect(toggles).toHaveLength(2)
    expect(screen.getByText('1 / 5')).toBeInTheDocument()
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })

  it('expands a panel to show the read-only frame detail with a copy button', () => {
    render(<NotificationsTab notifications={[progress(2, 5, 'almost')]} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
    const pre = document.querySelector('pre')
    expect(pre?.textContent).toContain('"method": "notifications/progress"')
    expect(pre?.textContent).toContain('"progress": 2')
    expect(screen.getByRole('button', { name: /copy json/i })).toBeInTheDocument()
  })

  it('collapses an expanded panel on a second click', () => {
    render(<NotificationsTab notifications={[progress(1, 5)]} />)
    const toggle = screen.getByRole('button', { expanded: false })
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(document.querySelector('pre')).toBeNull()
  })

  it('allows multiple panels to be open at once', () => {
    render(<NotificationsTab notifications={[progress(1, 5), progress(2, 5)]} />)
    for (const toggle of screen.getAllByRole('button', { expanded: false })) {
      fireEvent.click(toggle)
    }
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(2)
    expect(document.querySelectorAll('pre')).toHaveLength(2)
  })

  it('renders unknown notification methods via the generic fallback', () => {
    render(
      <NotificationsTab
        notifications={[{ method: 'notifications/custom/thing', params: { x: 1 }, at: 1 }]}
      />
    )
    expect(screen.getByText('custom/thing')).toBeInTheDocument()
    expect(screen.getByText('{"x":1}')).toBeInTheDocument()
  })
})
