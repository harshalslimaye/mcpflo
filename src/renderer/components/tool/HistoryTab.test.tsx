import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HistoryTab } from './HistoryTab'

describe('HistoryTab', () => {
  it('renders the empty state copy', () => {
    render(<HistoryTab />)
    expect(screen.getByText('No calls yet.')).toBeInTheDocument()
  })
})
