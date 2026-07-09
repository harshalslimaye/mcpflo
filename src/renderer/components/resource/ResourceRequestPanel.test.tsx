import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourceRequestPanel } from './ResourceRequestPanel'
import { estimateResourceTokens } from '../../lib/contextBudget'
import type { Resource } from '../../../shared/mcp.types'

const resource: Resource = { uri: 'demo://readme', name: 'README' }

const mockOnTabChange = vi.fn()

function renderPanel(
  props: Partial<React.ComponentProps<typeof ResourceRequestPanel>> = {}
): ReturnType<typeof render> {
  return render(
    <ResourceRequestPanel
      resource={resource}
      serverId="memory-mcp"
      activeTab="details"
      onTabChange={mockOnTabChange}
      reading={false}
      onRead={vi.fn()}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ResourceRequestPanel', () => {
  it('shows the uri read-only', () => {
    renderPanel()
    const input = screen.getByLabelText('Resource URI') as HTMLInputElement
    expect(input.value).toBe('demo://readme')
    expect(input).toHaveAttribute('readonly')
  })

  it('calls onRead when Read is clicked', () => {
    const onRead = vi.fn()
    renderPanel({ onRead })
    fireEvent.click(screen.getByText('Read'))
    expect(onRead).toHaveBeenCalledOnce()
  })

  it('shows the reading state and disables the button while reading', () => {
    renderPanel({ reading: true })
    const button = screen.getByRole('button', { name: /Reading…/ })
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Reading…')
    expect(screen.queryByText('Read', { selector: 'button' })).not.toBeInTheDocument()
  })

  it('shows the resource definition own token cost next to the URI', () => {
    renderPanel()
    const tokens = estimateResourceTokens(resource)
    expect(screen.getByText(`~${tokens.toLocaleString()} tokens to define`)).toBeInTheDocument()
  })
})

describe('ResourceRequestPanel — Tests tab', () => {
  it('offers a Tests tab alongside Details', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tests' })).toBeInTheDocument()
  })

  it('switches to the Tests tab when clicked', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Tests' }))
    expect(mockOnTabChange).toHaveBeenCalledWith('tests')
  })

  it('renders the script editor without throwing when window.api.testing is unavailable', () => {
    expect(window.api).toBeUndefined()
    renderPanel({ activeTab: 'tests' })
    expect(screen.queryByLabelText('Has a saved test script')).not.toBeInTheDocument()
  })

  describe('with a stubbed testing API', () => {
    let getScript: ReturnType<typeof vi.fn>
    let saveScript: ReturnType<typeof vi.fn>

    beforeEach(() => {
      getScript = vi.fn().mockResolvedValue(null)
      saveScript = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(window, 'api', {
        configurable: true,
        value: { testing: { getScript, saveScript, run: vi.fn() } }
      })
    })

    afterEach(() => {
      // @ts-expect-error — test-only cleanup of a global stubbed above.
      delete window.api
    })

    it('loads the saved script for this resource on mount', async () => {
      getScript.mockResolvedValue('test("a", function () {})')
      renderPanel({ activeTab: 'tests' })
      await waitFor(() =>
        expect(getScript).toHaveBeenCalledWith('memory-mcp', 'resource', 'demo://readme')
      )
      await waitFor(() =>
        expect(document.querySelector('.cm-content')?.textContent).toBe('test("a", function () {})')
      )
    })

    it('shows the dot indicator once a non-empty saved script loads', async () => {
      getScript.mockResolvedValue('test("a", function () {})')
      renderPanel()
      expect(await screen.findByLabelText('Has a saved test script')).toBeInTheDocument()
    })

    it('autosaves an edited script after the debounce delay', async () => {
      const user = userEvent.setup()
      renderPanel({ activeTab: 'tests' })
      await waitFor(() => expect(getScript).toHaveBeenCalled())

      const editable = document.querySelector('.cm-content') as HTMLElement
      editable.focus()
      await user.type(editable, 'x')

      expect(saveScript).not.toHaveBeenCalled()
      await waitFor(
        () =>
          expect(saveScript).toHaveBeenCalledWith('memory-mcp', 'resource', 'demo://readme', 'x'),
        { timeout: 2000 }
      )
    })
  })
})
