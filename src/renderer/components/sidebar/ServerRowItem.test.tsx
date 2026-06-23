import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ServerRowItem } from './ServerRowItem'
import { Server } from 'lucide-react'

const defaultProps = {
  icon: <Server size={13} />,
  label: 'Memory MCP',
  depth: 0 as const,
  expanded: false,
  onToggle: vi.fn()
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

  it('applies font-semibold at depth 0', () => {
    render(<ServerRowItem {...defaultProps} depth={0} />)
    expect(screen.getByText('Memory MCP')).toHaveClass('font-semibold')
  })

  it('does not apply font-semibold at depth 1', () => {
    render(<ServerRowItem {...defaultProps} depth={1} />)
    expect(screen.getByText('Memory MCP')).not.toHaveClass('font-semibold')
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

  it('renders a refresh control when onRefresh is provided', () => {
    render(<ServerRowItem {...defaultProps} onRefresh={vi.fn()} />)
    expect(screen.getByTitle('Refresh capabilities')).toBeInTheDocument()
  })

  it('does not render a refresh control when onRefresh is omitted', () => {
    render(<ServerRowItem {...defaultProps} />)
    expect(screen.queryByTitle('Refresh capabilities')).not.toBeInTheDocument()
  })

  it('calls onRefresh (and not onToggle) when the refresh control is clicked', () => {
    const onToggle = vi.fn()
    const onRefresh = vi.fn()
    render(<ServerRowItem {...defaultProps} onToggle={onToggle} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByTitle('Refresh capabilities'))
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('spins the refresh icon while fetching (connecting)', () => {
    render(<ServerRowItem {...defaultProps} status="connecting" onRefresh={vi.fn()} />)
    const icon = screen.getByTitle('Refresh capabilities').querySelector('svg')
    expect(icon).toHaveClass('animate-spin')
  })

  it('renders a disconnect control when onDisconnect is provided and status is connected', () => {
    render(<ServerRowItem {...defaultProps} status="connected" onDisconnect={vi.fn()} />)
    expect(screen.getByTitle('Disconnect server')).toBeInTheDocument()
  })

  it('does not render a disconnect control when onDisconnect is omitted', () => {
    render(<ServerRowItem {...defaultProps} status="connected" />)
    expect(screen.queryByTitle('Disconnect server')).not.toBeInTheDocument()
  })

  it.each(['connecting', 'disconnected', 'error'] as const)(
    'does not render a disconnect control when status is %s',
    (status) => {
      render(<ServerRowItem {...defaultProps} status={status} onDisconnect={vi.fn()} />)
      expect(screen.queryByTitle('Disconnect server')).not.toBeInTheDocument()
    }
  )

  it('calls onDisconnect (and not onToggle) when the disconnect control is clicked', () => {
    const onToggle = vi.fn()
    const onDisconnect = vi.fn()
    render(
      <ServerRowItem
        {...defaultProps}
        status="connected"
        onToggle={onToggle}
        onDisconnect={onDisconnect}
      />
    )
    fireEvent.click(screen.getByTitle('Disconnect server'))
    expect(onDisconnect).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('activates disconnect with Enter and Space without toggling the row', () => {
    const onToggle = vi.fn()
    const onDisconnect = vi.fn()
    render(
      <ServerRowItem
        {...defaultProps}
        status="connected"
        onToggle={onToggle}
        onDisconnect={onDisconnect}
      />
    )
    const disconnect = screen.getByTitle('Disconnect server')
    fireEvent.keyDown(disconnect, { key: 'Enter' })
    fireEvent.keyDown(disconnect, { key: ' ' })
    expect(onDisconnect).toHaveBeenCalledTimes(2)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('renders a delete control when onDelete is provided', () => {
    render(<ServerRowItem {...defaultProps} onDelete={vi.fn()} />)
    expect(screen.getByTitle('Delete server')).toBeInTheDocument()
  })

  it('does not render a delete control when onDelete is omitted', () => {
    render(<ServerRowItem {...defaultProps} />)
    expect(screen.queryByTitle('Delete server')).not.toBeInTheDocument()
  })

  it('calls onDelete (and not onToggle) when the delete control is clicked', () => {
    const onToggle = vi.fn()
    const onDelete = vi.fn()
    render(<ServerRowItem {...defaultProps} onToggle={onToggle} onDelete={onDelete} />)
    fireEvent.click(screen.getByTitle('Delete server'))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('activates refresh with Enter and Space without toggling the row', () => {
    const onToggle = vi.fn()
    const onRefresh = vi.fn()
    render(<ServerRowItem {...defaultProps} onToggle={onToggle} onRefresh={onRefresh} />)
    const refresh = screen.getByTitle('Refresh capabilities')
    fireEvent.keyDown(refresh, { key: 'Enter' })
    fireEvent.keyDown(refresh, { key: ' ' })
    expect(onRefresh).toHaveBeenCalledTimes(2)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('activates delete with Enter and Space without toggling the row', () => {
    const onToggle = vi.fn()
    const onDelete = vi.fn()
    render(<ServerRowItem {...defaultProps} onToggle={onToggle} onDelete={onDelete} />)
    const del = screen.getByTitle('Delete server')
    fireEvent.keyDown(del, { key: 'Enter' })
    fireEvent.keyDown(del, { key: ' ' })
    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('ignores other keys on the inline controls', () => {
    const onDisconnect = vi.fn()
    const onRefresh = vi.fn()
    const onDelete = vi.fn()
    render(
      <ServerRowItem
        {...defaultProps}
        status="connected"
        onDisconnect={onDisconnect}
        onRefresh={onRefresh}
        onDelete={onDelete}
      />
    )
    fireEvent.keyDown(screen.getByTitle('Disconnect server'), { key: 'Tab' })
    fireEvent.keyDown(screen.getByTitle('Refresh capabilities'), { key: 'a' })
    fireEvent.keyDown(screen.getByTitle('Delete server'), { key: 'Escape' })
    expect(onDisconnect).not.toHaveBeenCalled()
    expect(onRefresh).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })
})
