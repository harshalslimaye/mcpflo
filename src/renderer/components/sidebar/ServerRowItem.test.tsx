import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ServerRowItem } from './ServerRowItem'
import { Server } from 'lucide-react'

const defaultProps = {
  icon: <Server size={13} />,
  label: 'Memory MCP',
  depth: 0 as const,
  expanded: false,
  onToggle: vi.fn(),
}

describe('ServerRowItem', () => {
  it('renders label', () => {
    render(<ServerRowItem {...defaultProps} />)
    expect(screen.getByText('Memory MCP')).toBeInTheDocument()
  })

  it('renders count when provided', () => {
    render(<ServerRowItem {...defaultProps} count={4} />)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('does not render count when omitted', () => {
    const { container } = render(<ServerRowItem {...defaultProps} />)
    expect(container.querySelectorAll('span.ml-auto')).toHaveLength(0)
  })

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(<ServerRowItem {...defaultProps} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('does not call onToggle when disabled', () => {
    const onToggle = vi.fn()
    render(<ServerRowItem {...defaultProps} disabled onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('is disabled when disabled prop is true', () => {
    render(<ServerRowItem {...defaultProps} disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('applies depth 0 indent class', () => {
    const { container } = render(<ServerRowItem {...defaultProps} depth={0} />)
    expect(container.firstChild).toHaveClass('pl-2')
  })

  it('applies depth 1 indent class', () => {
    const { container } = render(<ServerRowItem {...defaultProps} depth={1} />)
    expect(container.firstChild).toHaveClass('pl-6')
  })

  it('applies font-medium at depth 0', () => {
    render(<ServerRowItem {...defaultProps} depth={0} />)
    expect(screen.getByText('Memory MCP')).toHaveClass('font-medium')
  })

  it('does not apply font-medium at depth 1', () => {
    render(<ServerRowItem {...defaultProps} depth={1} />)
    expect(screen.getByText('Memory MCP')).not.toHaveClass('font-medium')
  })

  it('renders status dot when status is provided', () => {
    const { container } = render(<ServerRowItem {...defaultProps} status="connected" />)
    expect(container.querySelector('[title="connected"]')).toBeInTheDocument()
  })

  it('does not render status dot when status is omitted', () => {
    const { container } = render(<ServerRowItem {...defaultProps} />)
    expect(container.querySelector('[title]')).not.toBeInTheDocument()
  })

  it('renders correct dot color for each status', () => {
    const statuses = ['connected', 'connecting', 'disconnected', 'error'] as const
    statuses.forEach((status) => {
      const { container } = render(<ServerRowItem {...defaultProps} status={status} />)
      expect(container.querySelector(`[title="${status}"]`)).toBeInTheDocument()
    })
  })
})
