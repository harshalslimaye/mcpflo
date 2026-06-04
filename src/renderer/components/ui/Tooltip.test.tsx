import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Tooltip } from './Tooltip'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderTooltip(label = 'Test label', delayMs = 400) {
  return render(
    <Tooltip label={label} side="right" delayMs={delayMs}>
      <button>Trigger</button>
    </Tooltip>
  )
}

describe('Tooltip', () => {
  it('does not show tooltip initially', () => {
    renderTooltip()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip after delay on mouseenter', () => {
    renderTooltip('Hover label', 400)
    fireEvent.mouseEnter(screen.getByRole('button'))
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hover label')
  })

  it('does not show tooltip before delay elapses', () => {
    renderTooltip('Label', 400)
    fireEvent.mouseEnter(screen.getByRole('button'))
    act(() => { vi.advanceTimersByTime(399) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('hides tooltip on mouseleave', () => {
    renderTooltip('Label', 0)
    const btn = screen.getByRole('button')
    fireEvent.mouseEnter(btn)
    act(() => { vi.runAllTimers() })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(btn)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('cancels pending tooltip if mouse leaves before delay', () => {
    renderTooltip('Label', 400)
    const btn = screen.getByRole('button')
    fireEvent.mouseEnter(btn)
    act(() => { vi.advanceTimersByTime(200) })
    fireEvent.mouseLeave(btn)
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip on focus', () => {
    renderTooltip('Focus label', 0)
    fireEvent.focus(screen.getByRole('button'))
    act(() => { vi.runAllTimers() })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Focus label')
  })

  it('hides tooltip on blur', () => {
    renderTooltip('Label', 0)
    const btn = screen.getByRole('button')
    fireEvent.focus(btn)
    act(() => { vi.runAllTimers() })
    fireEvent.blur(btn)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders tooltip text correctly', () => {
    renderTooltip('MCP Servers', 0)
    fireEvent.mouseEnter(screen.getByRole('button'))
    act(() => { vi.runAllTimers() })
    expect(screen.getByRole('tooltip')).toHaveTextContent('MCP Servers')
  })

  it('tooltip has pointer-events-none so it cannot be accidentally hovered', () => {
    renderTooltip('Label', 0)
    fireEvent.mouseEnter(screen.getByRole('button'))
    act(() => { vi.runAllTimers() })
    expect(screen.getByRole('tooltip')).toHaveClass('pointer-events-none')
  })
})
