import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CapabilitySection, type CapabilityRowData } from './CapabilitySection'
import { Wrench, Zap } from 'lucide-react'

const rows: CapabilityRowData[] = [
  {
    key: 'create_repository',
    icon: <Zap size={13} />,
    label: 'create_repository',
    description: 'Create a new repository in your account or an organization.',
    tokens: 360,
    onClick: vi.fn()
  },
  {
    key: 'create_branch',
    icon: <Zap size={13} />,
    label: 'create_branch',
    description: 'Create a new branch from a base ref.',
    tokens: 180,
    onClick: vi.fn()
  }
]

function defaultProps(): {
  icon: React.ReactNode
  label: string
  count: number
  tokens: number
  expanded: boolean
  onToggle: ReturnType<typeof vi.fn>
  rows: CapabilityRowData[]
} {
  return {
    icon: <Wrench size={13} />,
    label: 'Tools',
    count: 2,
    tokens: 540,
    expanded: false,
    onToggle: vi.fn(),
    rows
  }
}

describe('CapabilitySection', () => {
  it('renders the header label, count, and token total', () => {
    render(<CapabilitySection {...defaultProps()} />)
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('~540')).toBeInTheDocument()
  })

  it('does not render rows when collapsed', () => {
    render(<CapabilitySection {...defaultProps()} expanded={false} />)
    expect(screen.queryByText('create_repository')).not.toBeInTheDocument()
  })

  it('renders each row label, description, and tokens when expanded', () => {
    render(<CapabilitySection {...defaultProps()} expanded />)
    expect(screen.getByText('create_repository')).toBeInTheDocument()
    expect(
      screen.getByText('Create a new repository in your account or an organization.')
    ).toBeInTheDocument()
    expect(screen.getByText('~360')).toBeInTheDocument()
    expect(screen.getByText('create_branch')).toBeInTheDocument()
  })

  it('calls onToggle when the header is clicked', () => {
    const onToggle = vi.fn()
    render(<CapabilitySection {...defaultProps()} onToggle={onToggle} />)
    fireEvent.click(screen.getByText('Tools'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('calls a row’s onClick when that row is clicked', () => {
    const onClick = vi.fn()
    const rowsWithSpy = [{ ...rows[0], onClick }]
    render(<CapabilitySection {...defaultProps()} expanded rows={rowsWithSpy} />)
    fireEvent.click(screen.getByText('create_repository'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  describe('empty category (count 0)', () => {
    it('disables the header and ignores clicks', () => {
      const onToggle = vi.fn()
      render(<CapabilitySection {...defaultProps()} count={0} tokens={0} onToggle={onToggle} />)
      const header = screen.getByText('Tools').closest('button') as HTMLElement
      expect(header).toBeDisabled()
      fireEvent.click(header)
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('renders no rows even when expanded is true', () => {
      render(<CapabilitySection {...defaultProps()} count={0} tokens={0} expanded rows={rows} />)
      expect(screen.queryByText('create_repository')).not.toBeInTheDocument()
    })
  })
})
