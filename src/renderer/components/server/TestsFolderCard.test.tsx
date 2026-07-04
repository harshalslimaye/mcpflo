import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TestsFolderCard } from './TestsFolderCard'
import { useServerStore } from '../../stores/serverStore'
import type { MCPServer } from '../../../shared/mcp.types'

const server: MCPServer = {
  id: 'memory-mcp',
  name: 'Memory MCP',
  transport: { type: 'stdio', command: 'npx' },
  status: 'connected',
  tools: [],
  resources: [],
  prompts: []
}

const mockUpdateServer = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateServer.mockResolvedValue(undefined)
  useServerStore.setState({ updateServer: mockUpdateServer })
})

describe('TestsFolderCard — no stubbed testing API', () => {
  it('stays in the loading state without throwing when window.api.testing is unavailable', () => {
    expect(window.api).toBeUndefined()
    render(<TestsFolderCard server={server} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})

describe('TestsFolderCard — with a stubbed testing API', () => {
  let getTestsFolderStatus: ReturnType<typeof vi.fn>
  let chooseTestsFolder: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getTestsFolderStatus = vi.fn()
    chooseTestsFolder = vi.fn()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { testing: { getTestsFolderStatus, chooseTestsFolder } }
    })
  })

  afterEach(() => {
    // @ts-expect-error — test-only cleanup of a global stubbed above.
    delete window.api
  })

  it('shows the default path with no Custom chip and no Use-default button', async () => {
    getTestsFolderStatus.mockResolvedValue({
      path: '/userData/tests/memory-mcp',
      isCustom: false,
      exists: true
    })
    render(<TestsFolderCard server={server} />)
    expect(await screen.findByText('/userData/tests/memory-mcp')).toBeInTheDocument()
    expect(screen.queryByText('Custom')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use default' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeInTheDocument()
  })

  it('shows the custom path with a Custom chip and a Use-default button, no warning', async () => {
    getTestsFolderStatus.mockResolvedValue({
      path: '/Users/me/my-project/tests',
      isCustom: true,
      exists: true
    })
    render(<TestsFolderCard server={server} />)
    expect(await screen.findByText('/Users/me/my-project/tests')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use default' })).toBeInTheDocument()
    expect(screen.queryByText('Folder not found')).not.toBeInTheDocument()
  })

  it('shows a warning banner when the custom folder no longer exists', async () => {
    getTestsFolderStatus.mockResolvedValue({
      path: '/Users/me/deleted-folder',
      isCustom: true,
      exists: false
    })
    render(<TestsFolderCard server={server} />)
    expect(await screen.findByText('Folder not found')).toBeInTheDocument()
    // The fix is still offered even while broken.
    expect(screen.getByRole('button', { name: 'Use default' })).toBeInTheDocument()
  })

  it('persists the picked folder via updateServer after Choose folder', async () => {
    getTestsFolderStatus.mockResolvedValue({
      path: '/userData/tests/memory-mcp',
      isCustom: false,
      exists: true
    })
    chooseTestsFolder.mockResolvedValue('/Users/me/picked-folder')
    render(<TestsFolderCard server={server} />)
    await screen.findByText('/userData/tests/memory-mcp')

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))
    await waitFor(() =>
      expect(mockUpdateServer).toHaveBeenCalledWith('memory-mcp', {
        testsPath: '/Users/me/picked-folder'
      })
    )
  })

  it('does not call updateServer when the folder picker is cancelled', async () => {
    getTestsFolderStatus.mockResolvedValue({
      path: '/userData/tests/memory-mcp',
      isCustom: false,
      exists: true
    })
    chooseTestsFolder.mockResolvedValue(null)
    render(<TestsFolderCard server={server} />)
    await screen.findByText('/userData/tests/memory-mcp')

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))
    await waitFor(() => expect(chooseTestsFolder).toHaveBeenCalled())
    expect(mockUpdateServer).not.toHaveBeenCalled()
  })

  it('clears the custom path via updateServer after Use default', async () => {
    getTestsFolderStatus.mockResolvedValue({
      path: '/Users/me/my-project/tests',
      isCustom: true,
      exists: true
    })
    render(<TestsFolderCard server={server} />)
    await screen.findByText('/Users/me/my-project/tests')

    fireEvent.click(screen.getByRole('button', { name: 'Use default' }))
    await waitFor(() =>
      expect(mockUpdateServer).toHaveBeenCalledWith('memory-mcp', { testsPath: undefined })
    )
  })
})
