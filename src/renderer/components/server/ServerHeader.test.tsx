import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ServerHeader } from './ServerHeader'
import type { MCPServer } from '../../../shared/mcp.types'

const base: MCPServer = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  transport: { type: 'streamable-http', url: 'https://api.githubcopilot.com/mcp/' },
  status: 'connected',
  fetchedAt: Date.now() - 4 * 60 * 1000,
  tools: [],
  resources: [],
  prompts: []
}

const server = (over: Partial<MCPServer> = {}): MCPServer => ({ ...base, ...over })

describe('ServerHeader', () => {
  it('renders the server name as a heading', () => {
    render(<ServerHeader server={server()} />)
    expect(screen.getByRole('heading', { name: 'GitHub MCP' })).toBeInTheDocument()
  })

  it.each([
    ['connected', 'Connected'],
    ['connecting', 'Connecting'],
    ['disconnected', 'Disconnected'],
    ['error', 'Error']
  ] as const)('renders the %s status label', (status, label) => {
    render(<ServerHeader server={server({ status })} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  describe('transport row', () => {
    it('shows the http label and url for a streamable-http server', () => {
      render(<ServerHeader server={server()} />)
      expect(screen.getByText('http')).toBeInTheDocument()
      expect(screen.getByText('https://api.githubcopilot.com/mcp/')).toBeInTheDocument()
    })

    it('shows the stdio label and command for a stdio server', () => {
      render(
        <ServerHeader
          server={server({ transport: { type: 'stdio', command: 'npx', args: ['-y', 'pkg'] } })}
        />
      )
      expect(screen.getByText('stdio')).toBeInTheDocument()
      expect(screen.getByText('npx -y pkg')).toBeInTheDocument()
    })
  })

  describe('fetched-at line', () => {
    it('renders minutes for a recent fetch', () => {
      render(<ServerHeader server={server({ fetchedAt: Date.now() - 4 * 60 * 1000 })} />)
      expect(screen.getByText('Capabilities fetched 4 min ago')).toBeInTheDocument()
    })

    it('renders "just now" for a fetch under a minute old', () => {
      render(<ServerHeader server={server({ fetchedAt: Date.now() - 5 * 1000 })} />)
      expect(screen.getByText('Capabilities fetched just now')).toBeInTheDocument()
    })

    it('renders hours for an older fetch', () => {
      render(<ServerHeader server={server({ fetchedAt: Date.now() - 2 * 60 * 60 * 1000 })} />)
      expect(screen.getByText('Capabilities fetched 2 hr ago')).toBeInTheDocument()
    })

    it('renders days (pluralized) for a much older fetch', () => {
      render(<ServerHeader server={server({ fetchedAt: Date.now() - 3 * 24 * 60 * 60 * 1000 })} />)
      expect(screen.getByText('Capabilities fetched 3 days ago')).toBeInTheDocument()
    })

    it('omits the line when capabilities were never fetched', () => {
      render(<ServerHeader server={server({ fetchedAt: undefined })} />)
      expect(screen.queryByText(/Capabilities fetched/)).not.toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows the error message instead of the fetched-at line', () => {
      render(<ServerHeader server={server({ status: 'error', error: 'Connection refused' })} />)
      expect(screen.getByText('Connection refused')).toBeInTheDocument()
      expect(screen.queryByText(/Capabilities fetched/)).not.toBeInTheDocument()
    })
  })
})
