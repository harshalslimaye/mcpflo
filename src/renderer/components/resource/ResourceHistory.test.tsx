import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResourceHistory } from './ResourceHistory'
import type { ResourceReadRecord } from '../../stores/serverStore'

function rec(over: Partial<ResourceReadRecord>): ResourceReadRecord {
  return {
    id: 'r1',
    serverId: 'srv',
    uri: 'demo://x',
    status: 'success',
    durationMs: 10,
    at: Date.now(),
    ...over
  }
}

describe('ResourceHistory', () => {
  it('renders the empty state copy', () => {
    render(<ResourceHistory />)
    expect(screen.getByText('No reads yet.')).toBeInTheDocument()
  })

  it('shows the duration for a recorded read', () => {
    render(<ResourceHistory records={[rec({ durationMs: 17 })]} />)
    expect(screen.getByText('17 ms')).toBeInTheDocument()
  })

  it('shows a red status dot for error reads and green for success', () => {
    const { container } = render(
      <ResourceHistory records={[rec({ id: 'ok' }), rec({ id: 'bad', status: 'error' })]} />
    )
    expect(container.querySelector('.bg-green')).not.toBeNull()
    expect(container.querySelector('.bg-red-500')).not.toBeNull()
  })
})
