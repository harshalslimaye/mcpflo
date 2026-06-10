import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Toggle } from './Toggle'

describe('Toggle', () => {
  it('renders a switch with the given label', () => {
    render(<Toggle checked={false} onChange={() => {}} aria-label="Verbose" />)
    expect(screen.getByRole('switch', { name: 'Verbose' })).toBeInTheDocument()
  })

  it('reflects the checked state via aria-checked', () => {
    render(<Toggle checked onChange={() => {}} aria-label="Verbose" />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onChange with the toggled value', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} aria-label="Verbose" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does not fire when disabled', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} aria-label="Verbose" disabled />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
