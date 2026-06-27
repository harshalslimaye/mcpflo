import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'
import { AuthHost } from './AuthHost'
import { useServerStore } from '../../stores/serverStore'
import type { AuthEvent, MCPServer } from '../../../shared/mcp.types'

const oauthServer: MCPServer = {
  id: 'oauth-mcp',
  name: 'OAuth MCP',
  transport: { type: 'streamable-http', url: 'https://oauth.example.com/mcp', auth: 'oauth' },
  status: 'disconnected',
  tools: [],
  resources: [],
  prompts: [],
  auth: { status: 'idle' }
}

let emitAuth: (e: AuthEvent) => void
let unsubscribed: boolean

beforeEach(() => {
  vi.clearAllMocks()
  unsubscribed = false
  useServerStore.setState({ servers: [oauthServer] })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      mcp: {
        onAuthEvent: (cb: typeof emitAuth): (() => void) => {
          emitAuth = cb
          return () => {
            unsubscribed = true
          }
        }
      }
    }
  })
})

const authOf = (id: string): MCPServer['auth'] =>
  useServerStore.getState().servers.find((s) => s.id === id)?.auth

describe('AuthHost', () => {
  it('renders nothing', () => {
    const { container } = render(<AuthHost />)
    expect(container).toBeEmptyDOMElement()
  })

  it('routes pushed auth events into the store', () => {
    render(<AuthHost />)
    act(() => emitAuth({ type: 'success', serverId: 'oauth-mcp' }))
    expect(authOf('oauth-mcp')).toEqual({ status: 'authenticated' })
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<AuthHost />)
    unmount()
    expect(unsubscribed).toBe(true)
  })

  it('shows the DCR recovery modal on a dcr_required event', () => {
    render(<AuthHost />)
    act(() => emitAuth({ type: 'dcr_required', serverId: 'oauth-mcp' }))
    expect(screen.getByText('Sign in requires a Client ID')).toBeInTheDocument()
  })

  it('does not show the recovery modal for a non-DCR error', () => {
    render(<AuthHost />)
    act(() => emitAuth({ type: 'error', serverId: 'oauth-mcp', reason: 'network down' }))
    expect(screen.queryByText('Sign in requires a Client ID')).not.toBeInTheDocument()
  })
})
