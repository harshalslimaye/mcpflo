import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ServerActionBar } from './ServerActionBar'
import type { MCPServer } from '../../../shared/mcp.types'

const base: MCPServer = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp/' },
  status: 'connected',
  tools: [],
  resources: [],
  prompts: []
}

const server = (over: Partial<MCPServer> = {}): MCPServer => ({ ...base, ...over })

function renderBar(over: Partial<MCPServer> = {}): {
  onDisconnect: ReturnType<typeof vi.fn>
  onReload: ReturnType<typeof vi.fn>
  onCancel: ReturnType<typeof vi.fn>
  onSignOut: ReturnType<typeof vi.fn>
  onDelete: ReturnType<typeof vi.fn>
} {
  const handlers = {
    onDisconnect: vi.fn(),
    onReload: vi.fn(),
    onCancel: vi.fn(),
    onSignOut: vi.fn(),
    onDelete: vi.fn()
  }
  render(<ServerActionBar server={server(over)} {...handlers} />)
  return handlers
}

describe('ServerActionBar', () => {
  describe('Disconnect', () => {
    it('is shown for a connected server and calls onDisconnect', () => {
      const { onDisconnect } = renderBar({ status: 'connected' })
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
      expect(onDisconnect).toHaveBeenCalledOnce()
    })

    it.each(['connecting', 'disconnected', 'error'] as const)('is hidden when %s', (status) => {
      renderBar({ status })
      expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument()
    })
  })

  describe('Reload capabilities', () => {
    it('is shown when not fetching and calls onReload', () => {
      const { onReload } = renderBar({ status: 'connected' })
      fireEvent.click(screen.getByRole('button', { name: 'Reload capabilities' }))
      expect(onReload).toHaveBeenCalledOnce()
    })

    it('stays shown but disabled while connecting, alongside a Cancel button', () => {
      renderBar({ status: 'connecting' })
      expect(screen.getByRole('button', { name: 'Reload capabilities' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('Cancel calls onCancel', () => {
      const { onCancel } = renderBar({ status: 'connecting' })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onCancel).toHaveBeenCalledOnce()
    })

    it('does not show Cancel when not fetching', () => {
      renderBar({ status: 'connected' })
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })
  })

  describe('Sign out', () => {
    it('is shown for an authenticated OAuth server and calls onSignOut', () => {
      const { onSignOut } = renderBar({ auth: { status: 'authenticated' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
      expect(onSignOut).toHaveBeenCalledOnce()
    })

    it.each(['idle', 'authenticating', 'auth_required'] as const)(
      'is hidden when auth is %s',
      (status) => {
        renderBar({ auth: { status } })
        expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
      }
    )

    it('is hidden for a non-OAuth server', () => {
      renderBar({ auth: undefined })
      expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    })
  })

  describe('Delete server', () => {
    it('is always shown and calls onDelete', () => {
      const { onDelete } = renderBar({ status: 'disconnected' })
      fireEvent.click(screen.getByRole('button', { name: 'Delete server' }))
      expect(onDelete).toHaveBeenCalledOnce()
    })
  })
})
