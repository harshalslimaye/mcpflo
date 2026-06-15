import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CapabilityItem } from './CapabilityItem'
import { Zap } from 'lucide-react'

describe('CapabilityItem', () => {
  it('renders label', () => {
    render(<CapabilityItem icon={<Zap size={11} />} label="list_tools" />)
    expect(screen.getByText('list_tools')).toBeInTheDocument()
  })

  it('renders icon', () => {
    const { container } = render(<CapabilityItem icon={<Zap size={11} />} label="list_tools" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders the guide rail and indent offset', () => {
    const { container } = render(<CapabilityItem icon={<Zap size={13} />} label="list_tools" />)
    expect(container.firstChild).toHaveClass('ml-1.5')
    expect(container.firstChild).toHaveClass('border-l')
  })

  it('shows the active accent border when selected', () => {
    const { container } = render(
      <CapabilityItem icon={<Zap size={13} />} label="list_tools" selected />
    )
    expect(container.firstChild).toHaveClass('border-l-2')
    expect(container.firstChild).toHaveClass('text-accent')
  })

  it('does not truncate the label', () => {
    render(<CapabilityItem icon={<Zap size={13} />} label="trigger-long-running-operation" />)
    expect(screen.getByText('trigger-long-running-operation')).not.toHaveClass('truncate')
  })
})
