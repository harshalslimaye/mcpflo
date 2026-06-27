import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DcrRecoveryModal } from './DcrRecoveryModal'
import { useServerStore } from '../../stores/serverStore'
import type { MCPServer } from '../../../shared/mcp.types'

const server: MCPServer = {
  id: 'oauth-mcp',
  name: 'OAuth MCP',
  transport: { type: 'streamable-http', url: 'https://oauth.example.com/mcp', auth: 'oauth' },
  status: 'disconnected',
  tools: [],
  resources: [],
  prompts: [],
  auth: { status: 'auth_required', reason: 'DCR_FAILED' }
}

const updateServer = vi.fn()
const authorizeServer = vi.fn()
const onClose = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  updateServer.mockResolvedValue(undefined)
  authorizeServer.mockResolvedValue(undefined)
  useServerStore.setState({ updateServer, authorizeServer })
})

describe('DcrRecoveryModal', () => {
  it('requires a Client ID before continuing', () => {
    render(<DcrRecoveryModal server={server} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Client ID is required')).toBeInTheDocument()
    expect(updateServer).not.toHaveBeenCalled()
  })

  it('saves the credentials and re-runs the flow on Continue', async () => {
    render(<DcrRecoveryModal server={server} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'cid' } })
    fireEvent.change(screen.getByLabelText('Client Secret'), { target: { value: 'sec' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(updateServer).toHaveBeenCalledOnce())
    expect(updateServer).toHaveBeenCalledWith('oauth-mcp', {
      transport: {
        type: 'streamable-http',
        url: 'https://oauth.example.com/mcp',
        auth: 'oauth',
        oauth: { clientId: 'cid', clientSecret: 'sec' }
      }
    })
    expect(onClose).toHaveBeenCalled()
    await waitFor(() => expect(authorizeServer).toHaveBeenCalledWith('oauth-mcp'))
  })

  it('cancels without saving', () => {
    render(<DcrRecoveryModal server={server} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(updateServer).not.toHaveBeenCalled()
  })
})
