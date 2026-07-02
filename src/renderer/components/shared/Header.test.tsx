import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('renders a short description in full with no Read more toggle', () => {
    render(<Header title="x" description="does a thing" />)
    expect(screen.getByText('does a thing')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /read more/i })).not.toBeInTheDocument()
  })

  it('truncates a long description behind a Read more toggle that expands and collapses', async () => {
    const user = userEvent.setup()
    const long = 'a'.repeat(300)
    render(<Header title="x" description={long} />)

    expect(screen.getByText(`${'a'.repeat(240)}…`)).toBeInTheDocument()
    expect(screen.queryByText(long)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /read more/i }))
    expect(screen.getByText(long)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /read less/i }))
    expect(screen.getByText(`${'a'.repeat(240)}…`)).toBeInTheDocument()
  })
})
