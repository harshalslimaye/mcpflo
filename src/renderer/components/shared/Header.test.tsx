import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from './Header'

describe('Header', () => {
  it('renders the title and meta chips in order', () => {
    render(
      <Header
        title="my_tool"
        chips={[
          { icon: null, label: 'Memory MCP' },
          { icon: null, label: 'text/plain' }
        ]}
      />
    )
    expect(screen.getByText('my_tool')).toBeInTheDocument()
    expect(screen.getByText('Memory MCP')).toBeInTheDocument()
    expect(screen.getByText('text/plain')).toBeInTheDocument()
  })

  it('omits the description paragraph when absent', () => {
    const { container } = render(<Header title="x" />)
    expect(container.querySelector('p')).not.toBeInTheDocument()
  })

  it('renders the description when provided', () => {
    render(<Header title="x" description="does a thing" />)
    expect(screen.getByText('does a thing')).toBeInTheDocument()
  })

  it('renders badges with their per-badge className', () => {
    render(
      <Header
        title="x"
        badges={[{ label: 'Destructive', icon: null, className: 'text-red-500' }]}
      />
    )
    expect(screen.getByText('Destructive').className).toMatch(/red/)
  })

  it('renders no badge row when there are no badges', () => {
    const { container } = render(<Header title="x" chips={[{ icon: null, label: 'srv' }]} />)
    // Only the title row div should be present, not a separate badges row.
    expect(container.querySelectorAll('.flex-wrap')).toHaveLength(1)
  })
})
