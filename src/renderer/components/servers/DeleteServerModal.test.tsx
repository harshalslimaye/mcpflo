import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteServerModal } from './DeleteServerModal'
import { useServerStore } from '../../stores/serverStore'

const mockRemoveServer = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockRemoveServer.mockResolvedValue(undefined)
  useServerStore.setState({ removeServer: mockRemoveServer })
})

describe('DeleteServerModal', () => {
  it('shows the server name in the confirmation', () => {
    render(<DeleteServerModal serverId="s1" serverName="Memory MCP" onClose={vi.fn()} />)
    expect(screen.getByText('Memory MCP')).toBeInTheDocument()
  })

  it('calls removeServer with the id and closes on confirm', async () => {
    const onClose = vi.fn()
    render(<DeleteServerModal serverId="s1" serverName="Memory MCP" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mockRemoveServer).toHaveBeenCalledWith('s1'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not remove and just closes on cancel', () => {
    const onClose = vi.fn()
    render(<DeleteServerModal serverId="s1" serverName="Memory MCP" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockRemoveServer).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
