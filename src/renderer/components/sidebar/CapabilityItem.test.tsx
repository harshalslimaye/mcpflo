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

  it('applies depth-2 indent', () => {
    const { container } = render(<CapabilityItem icon={<Zap size={11} />} label="list_tools" />)
    expect(container.firstChild).toHaveClass('pl-12')
  })
})
