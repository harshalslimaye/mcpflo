import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContentArea } from './ContentArea'

describe('ContentArea', () => {
  it('renders primary empty state text', () => {
    render(<ContentArea />)
    expect(screen.getByText('Select an MCP Server')).toBeInTheDocument()
  })

  it('renders secondary empty state text', () => {
    render(<ContentArea />)
    expect(screen.getByText('or tool to get started')).toBeInTheDocument()
  })

  it('renders the server icon', () => {
    const { container } = render(<ContentArea />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('contains a flex centering container', () => {
    const { container } = render(<ContentArea />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('flex')
    expect(root.className).toContain('items-center')
    expect(root.className).toContain('justify-center')
  })
})
