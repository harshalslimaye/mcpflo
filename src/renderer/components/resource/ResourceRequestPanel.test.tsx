import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResourceRequestPanel } from './ResourceRequestPanel'
import type { Resource } from '../../../shared/mcp.types'

const resource: Resource = { uri: 'demo://readme', name: 'README' }

describe('ResourceRequestPanel', () => {
  it('shows the uri read-only', () => {
    render(<ResourceRequestPanel resource={resource} reading={false} onRead={vi.fn()} />)
    const input = screen.getByLabelText('Resource URI') as HTMLInputElement
    expect(input.value).toBe('demo://readme')
    expect(input).toHaveAttribute('readonly')
  })

  it('calls onRead when Read is clicked', () => {
    const onRead = vi.fn()
    render(<ResourceRequestPanel resource={resource} reading={false} onRead={onRead} />)
    fireEvent.click(screen.getByText('Read'))
    expect(onRead).toHaveBeenCalledOnce()
  })

  it('shows the reading state and disables the button while reading', () => {
    render(<ResourceRequestPanel resource={resource} reading={true} onRead={vi.fn()} />)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Reading…')
    expect(screen.queryByText('Read', { selector: 'button' })).not.toBeInTheDocument()
  })
})
