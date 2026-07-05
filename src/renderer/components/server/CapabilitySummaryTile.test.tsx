import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CapabilitySummaryTile } from './CapabilitySummaryTile'

describe('CapabilitySummaryTile', () => {
  it('shows the label, count, and token estimate', () => {
    render(
      <CapabilitySummaryTile icon={<span />} label="Tools" count={8} tokens={2740} onClick={vi.fn()} />
    )
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('· ~2,740')).toBeInTheDocument()
  })

  it('calls onClick when a non-empty tile is clicked', () => {
    const onClick = vi.fn()
    render(
      <CapabilitySummaryTile icon={<span />} label="Tools" count={8} tokens={2740} onClick={onClick} />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('disables the tile when the category is empty', () => {
    render(
      <CapabilitySummaryTile icon={<span />} label="Prompts" count={0} tokens={0} onClick={vi.fn()} />
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
