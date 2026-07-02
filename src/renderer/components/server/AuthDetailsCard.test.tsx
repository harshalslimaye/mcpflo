import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthDetailsCard } from './AuthDetailsCard'
import type { MCPServer, AuthDetails, ServerAuthState } from '../../../shared/mcp.types'

const mockGetAuthDetails = vi.fn()
;(globalThis as Record<string, unknown>).api = { mcp: { getAuthDetails: mockGetAuthDetails } }

const base: MCPServer = {
  id: 'oauth-mcp',
  name: 'OAuth MCP',
  transport: { type: 'streamable-http', url: 'https://example.com/mcp', auth: 'oauth' },
  status: 'connected',
  tools: [],
  resources: [],
  prompts: []
}

const server = (auth?: ServerAuthState): MCPServer => ({ ...base, ...(auth && { auth }) })

const details: AuthDetails = {
  clientId: 'client-123',
  registration: 'dcr',
  clientType: 'confidential',
  scope: 'read:tools write:resources',
  tokenType: 'Bearer',
  issuedAt: Date.now(),
  // Comfortably inside the "hours" formatting bucket so the render-time clock
  // (a few ms later than this fixture) can't slip it down into minutes.
  expiresAt: Date.now() + 2.5 * 3600 * 1000,
  hasRefreshToken: true,
  hasIdToken: true,
  redirectUri: 'http://127.0.0.1:54321/callback'
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuthDetails.mockResolvedValue(details)
})

describe('AuthDetailsCard', () => {
  it('renders nothing for a non-OAuth server and never fetches', () => {
    const { container } = render(<AuthDetailsCard server={server()} />)
    expect(container).toBeEmptyDOMElement()
    expect(mockGetAuthDetails).not.toHaveBeenCalled()
  })

  it('renders nothing while the server is not signed in', () => {
    const { container } = render(<AuthDetailsCard server={server({ status: 'idle' })} />)
    expect(container).toBeEmptyDOMElement()
    expect(mockGetAuthDetails).not.toHaveBeenCalled()
  })

  it('renders the session summary for an authenticated server', async () => {
    render(<AuthDetailsCard server={server({ status: 'authenticated' })} />)

    expect(await screen.findByText('Authentication')).toBeInTheDocument()
    expect(mockGetAuthDetails).toHaveBeenCalledWith('oauth-mcp')
    expect(screen.getByText('Signed in')).toBeInTheDocument()
    expect(screen.getByText('client-123')).toBeInTheDocument()
    expect(screen.getByText('Auto-registered (DCR)')).toBeInTheDocument()
    expect(screen.getByText('Confidential')).toBeInTheDocument()
    // Scopes render as individual chips.
    expect(screen.getByText('read:tools')).toBeInTheDocument()
    expect(screen.getByText('write:resources')).toBeInTheDocument()
    expect(screen.getByText('Bearer')).toBeInTheDocument()
    expect(screen.getByText(/in 2 hr \d+ min/)).toBeInTheDocument()
    // Refresh token and ID token both read "Available" for this fixture.
    expect(screen.getAllByText('Available')).toHaveLength(2)
    expect(screen.getByText('http://127.0.0.1:54321/callback')).toBeInTheDocument()
  })

  it('labels a manually configured, public client and missing optional fields', async () => {
    mockGetAuthDetails.mockResolvedValue({
      registration: 'manual',
      clientId: 'manual-cid',
      clientType: 'public',
      tokenType: 'bearer',
      expiresAt: null,
      hasRefreshToken: false,
      hasIdToken: false
    } satisfies AuthDetails)
    render(<AuthDetailsCard server={server({ status: 'authenticated' })} />)

    expect(await screen.findByText('Manual Client ID')).toBeInTheDocument()
    expect(screen.getByText('Public')).toBeInTheDocument()
    expect(screen.getByText('Not reported')).toBeInTheDocument()
    expect(screen.getByText('No expiry reported')).toBeInTheDocument()
    // Refresh token and ID token both read "None" for this fixture.
    expect(screen.getAllByText('None')).toHaveLength(2)
    // No redirect_port was ever persisted for this session.
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('shows Expired when the token lifetime has passed', async () => {
    mockGetAuthDetails.mockResolvedValue({ ...details, expiresAt: Date.now() - 1000 })
    render(<AuthDetailsCard server={server({ status: 'authenticated' })} />)
    expect(await screen.findByText('Expired')).toBeInTheDocument()
  })

  it('renders the header immediately, before the async fetch resolves', () => {
    // A promise that never settles within the test — this must be true on
    // the very first render, so the grid this card shares with
    // ContextBudgetCard never collapses to one column while the IPC round
    // trip is still in flight. (Left pending on purpose: RTL's cleanup
    // unmounts the component, whose effect cleanup marks the fetch inactive,
    // so there's nothing left to resolve into a stray state update.)
    mockGetAuthDetails.mockReturnValue(new Promise(() => {}))
    render(<AuthDetailsCard server={server({ status: 'authenticated' })} />)

    expect(screen.getByText('Authentication')).toBeInTheDocument()
    expect(screen.getByText('Signed in')).toBeInTheDocument()
    expect(screen.getByText('Loading session details…')).toBeInTheDocument()
  })

  it('shows a fallback message rather than vanishing when main reports no session', async () => {
    mockGetAuthDetails.mockResolvedValue(null)
    render(<AuthDetailsCard server={server({ status: 'authenticated' })} />)

    expect(await screen.findByText('No session details available.')).toBeInTheDocument()
    // The header stays put — only the body swapped to the fallback message.
    expect(screen.getByText('Authentication')).toBeInTheDocument()
  })
})
