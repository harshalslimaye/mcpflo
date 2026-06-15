import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryRow } from './CategoryRow'
import { Wrench } from 'lucide-react'

const defaultProps = {
  icon: <Wrench size={13} />,
  label: 'Tools',
  count: 3,
  expanded: false,
  onToggle: vi.fn()
}

describe('CategoryRow', () => {
  it('renders the label', () => {
    render(<CategoryRow {...defaultProps} />)
    expect(screen.getByText('Tools')).toBeInTheDocument()
  })

  it('renders the count inside the button', () => {
    render(<CategoryRow {...defaultProps} count={7} />)
    expect(screen.getByRole('button')).toHaveTextContent('7')
  })

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(<CategoryRow {...defaultProps} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('is disabled and does not toggle when disabled', () => {
    const onToggle = vi.fn()
    render(<CategoryRow {...defaultProps} disabled onToggle={onToggle} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onToggle).not.toHaveBeenCalled()
  })
})
