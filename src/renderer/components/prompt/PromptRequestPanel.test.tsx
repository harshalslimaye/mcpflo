import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PromptRequestPanel } from './PromptRequestPanel'
import type { Prompt } from '../../../shared/mcp.types'

const argPrompt: Prompt = {
  name: 'summarize',
  arguments: [{ name: 'topic', description: 'What to summarize', required: true }, { name: 'tone' }]
}

const emptyPrompt: Prompt = { name: 'ping' }

const mockOnExecute = vi.fn()
const mockOnTabChange = vi.fn()

function renderPanel(
  p: Prompt,
  props: Partial<React.ComponentProps<typeof PromptRequestPanel>> = {}
): ReturnType<typeof render> {
  return render(
    <PromptRequestPanel
      prompt={p}
      serverId="memory-mcp"
      activeTab="params"
      onTabChange={mockOnTabChange}
      running={false}
      onExecute={mockOnExecute}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PromptRequestPanel — form rendering', () => {
  it('renders a text input for each argument', () => {
    renderPanel(argPrompt)
    expect(screen.getByRole('textbox', { name: 'topic' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'tone' })).toBeInTheDocument()
  })

  it('exposes the argument description via a help tooltip', async () => {
    renderPanel(argPrompt)
    const help = screen.getAllByRole('button', { name: 'Field help' })[0]
    fireEvent.focus(help)
    expect(await screen.findByText('What to summarize')).toBeInTheDocument()
  })

  it('marks the required argument with an asterisk', () => {
    renderPanel(argPrompt)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('shows a no-arguments message for a prompt with no arguments', () => {
    renderPanel(emptyPrompt)
    expect(screen.getByText('This prompt takes no arguments.')).toBeInTheDocument()
  })

  it('renders the synthesized schema on the Schema tab', () => {
    renderPanel(argPrompt, { activeTab: 'schema' })
    expect(screen.getByText(/"topic"/)).toBeInTheDocument()
  })

  it('reports tab changes through onTabChange', () => {
    renderPanel(argPrompt)
    fireEvent.click(screen.getByRole('button', { name: 'Schema' }))
    expect(mockOnTabChange).toHaveBeenCalledWith('schema')
  })
})

describe('PromptRequestPanel — validation and execute', () => {
  it('disables Get Prompt while a required argument is empty', () => {
    renderPanel(argPrompt)
    expect(screen.getByRole('button', { name: /Get Prompt/ })).toBeDisabled()
  })

  it('enables Get Prompt once the required argument is filled', () => {
    renderPanel(argPrompt)
    fireEvent.change(screen.getByRole('textbox', { name: 'topic' }), { target: { value: 'mcp' } })
    expect(screen.getByRole('button', { name: /Get Prompt/ })).toBeEnabled()
  })

  it('executes with only the filled arguments as strings', () => {
    renderPanel(argPrompt)
    fireEvent.change(screen.getByRole('textbox', { name: 'topic' }), { target: { value: 'mcp' } })
    fireEvent.click(screen.getByRole('button', { name: /Get Prompt/ }))
    // The untouched optional `tone` is dropped rather than sent as an empty string.
    expect(mockOnExecute).toHaveBeenCalledWith({ topic: 'mcp' })
  })

  it('executes immediately for a prompt with no arguments', () => {
    renderPanel(emptyPrompt)
    fireEvent.click(screen.getByRole('button', { name: /Get Prompt/ }))
    expect(mockOnExecute).toHaveBeenCalledWith({})
  })
})

describe('PromptRequestPanel — raw JSON', () => {
  it('coerces non-string values to strings on execute', () => {
    renderPanel(argPrompt)
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{"topic": "mcp", "count": 3}' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Get Prompt/ }))
    expect(mockOnExecute).toHaveBeenCalledWith({ topic: 'mcp', count: '3' })
  })

  it('disables Get Prompt on invalid JSON', () => {
    renderPanel(argPrompt)
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{ not json' }
    })
    expect(screen.getByRole('button', { name: /Get Prompt/ })).toBeDisabled()
  })
})

describe('PromptRequestPanel — prefill', () => {
  it('fills the form from a prefill request', () => {
    renderPanel(argPrompt, { prefill: { args: { topic: 'history' }, nonce: 1 } })
    expect(screen.getByRole('textbox', { name: 'topic' })).toHaveValue('history')
  })
})

describe('PromptRequestPanel — Tokens tab', () => {
  it('offers a Tokens tab alongside Params and Schema', () => {
    renderPanel(argPrompt)
    expect(screen.getByRole('button', { name: 'Params' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schema' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tokens' })).toBeInTheDocument()
  })

  it('renders the definition footprint, independent of the form state', () => {
    renderPanel(argPrompt, { activeTab: 'tokens' })
    expect(screen.getByText('Definition footprint')).toBeInTheDocument()
    expect(screen.getByText('Context impact')).toBeInTheDocument()
  })

  it('switches to the Tokens tab when clicked', () => {
    renderPanel(argPrompt)
    fireEvent.click(screen.getByRole('button', { name: 'Tokens' }))
    expect(mockOnTabChange).toHaveBeenCalledWith('tokens')
  })
})

describe('PromptRequestPanel — Tests tab', () => {
  it('offers a Tests tab alongside Params, Schema, and Tokens', () => {
    renderPanel(argPrompt)
    expect(screen.getByRole('button', { name: 'Tests' })).toBeInTheDocument()
  })

  it('switches to the Tests tab when clicked', () => {
    renderPanel(argPrompt)
    fireEvent.click(screen.getByRole('button', { name: 'Tests' }))
    expect(mockOnTabChange).toHaveBeenCalledWith('tests')
  })

  it('renders the script editor without throwing when window.api.testing is unavailable', () => {
    expect(window.api).toBeUndefined()
    renderPanel(argPrompt, { activeTab: 'tests' })
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
        value: {
          testing: {
            getScript,
            saveScript,
            run: vi.fn(),
            getRequests: vi.fn().mockResolvedValue(null),
            saveRequests: vi.fn().mockResolvedValue(undefined)
          }
        }
      })
    })

    afterEach(() => {
      // @ts-expect-error — test-only cleanup of a global stubbed above.
      delete window.api
    })

    it('loads the saved script for this prompt on mount', async () => {
      getScript.mockResolvedValue('test("a", function () {})')
      renderPanel(argPrompt, { activeTab: 'tests' })
      await waitFor(() =>
        expect(getScript).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize')
      )
      await waitFor(() =>
        expect(document.querySelector('.cm-content')?.textContent).toBe('test("a", function () {})')
      )
    })

    it('shows the dot indicator once a non-empty saved script loads', async () => {
      getScript.mockResolvedValue('test("a", function () {})')
      renderPanel(argPrompt)
      expect(await screen.findByLabelText('Has a saved test script')).toBeInTheDocument()
    })

    it('autosaves an edited script after the debounce delay', async () => {
      const user = userEvent.setup()
      renderPanel(argPrompt, { activeTab: 'tests' })
      await waitFor(() => expect(getScript).toHaveBeenCalled())

      const editable = document.querySelector('.cm-content') as HTMLElement
      editable.focus()
      await user.type(editable, 'x')

      expect(saveScript).not.toHaveBeenCalled()
      await waitFor(
        () => expect(saveScript).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize', 'x'),
        { timeout: 2000 }
      )
    })
  })
})

describe('PromptRequestPanel — Saved tab', () => {
  it('offers a Saved tab alongside Params, Schema, Tokens, and Tests', () => {
    renderPanel(argPrompt)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('switches to the Saved tab when clicked', () => {
    renderPanel(argPrompt)
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    expect(mockOnTabChange).toHaveBeenCalledWith('saved')
  })

  it('renders the Saved tab without throwing when window.api.testing is unavailable', () => {
    // No window.api stub in this file's tests — the panel must degrade to an
    // empty, unloaded list rather than crash.
    expect(window.api).toBeUndefined()
    renderPanel(argPrompt, { activeTab: 'saved' })
    expect(screen.getByText(/No saved requests yet/)).toBeInTheDocument()
  })

  describe('with a stubbed testing API', () => {
    let getScript: ReturnType<typeof vi.fn>
    let saveScript: ReturnType<typeof vi.fn>
    let getRequests: ReturnType<typeof vi.fn>
    let saveRequests: ReturnType<typeof vi.fn>

    beforeEach(() => {
      getScript = vi.fn().mockResolvedValue(null)
      saveScript = vi.fn().mockResolvedValue(undefined)
      getRequests = vi.fn().mockResolvedValue(null)
      saveRequests = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(window, 'api', {
        configurable: true,
        value: {
          testing: {
            getScript,
            saveScript,
            run: vi.fn(),
            getRequests,
            saveRequests
          }
        }
      })
    })

    afterEach(() => {
      // @ts-expect-error — test-only cleanup of a global stubbed above.
      delete window.api
    })

    it('shows the empty state when there are no saved requests', async () => {
      renderPanel(argPrompt, { activeTab: 'saved' })
      await waitFor(() =>
        expect(getRequests).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize')
      )
      expect(await screen.findByText(/No saved requests yet/)).toBeInTheDocument()
    })

    it('shows a count badge once saved requests load', async () => {
      getRequests.mockResolvedValue({
        requests: [
          { id: '1', name: 'a', args: {}, createdAt: 1, updatedAt: 1 },
          { id: '2', name: 'b', args: {}, createdAt: 1, updatedAt: 1 }
        ]
      })
      renderPanel(argPrompt)
      expect(await screen.findByText('(2)')).toBeInTheDocument()
    })

    it('shows no count badge when there are no saved requests', async () => {
      renderPanel(argPrompt)
      await waitFor(() => expect(getRequests).toHaveBeenCalled())
      expect(screen.queryByText(/^\(\d+\)$/)).not.toBeInTheDocument()
    })

    it('the footer Save button snapshots the live Params form as raw values and persists it', async () => {
      const { rerender } = render(
        <PromptRequestPanel
          prompt={argPrompt}
          serverId="memory-mcp"
          activeTab="params"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      await waitFor(() => expect(getRequests).toHaveBeenCalled())
      fireEvent.change(screen.getByRole('textbox', { name: 'topic' }), {
        target: { value: 'mcp' }
      })

      // The Save button lives in the footer next to Get Prompt — no need to
      // navigate to the Saved tab first.
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'New saved request name' }), {
        target: { value: 'Happy path' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm save request' }))

      // Stored as raw form values, not toStringArgs' wire-format output — the
      // saved request must round-trip straight back into the RJSF form.
      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize', {
        requests: [
          expect.objectContaining({
            name: 'Happy path',
            args: expect.objectContaining({ topic: 'mcp' })
          })
        ]
      })

      rerender(
        <PromptRequestPanel
          prompt={argPrompt}
          serverId="memory-mcp"
          activeTab="saved"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      expect(await screen.findByText('Happy path')).toBeInTheDocument()
    })

    it('defaults the saved request name to "Request N" when left blank', async () => {
      const { rerender } = render(
        <PromptRequestPanel
          prompt={argPrompt}
          serverId="memory-mcp"
          activeTab="params"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      await waitFor(() => expect(getRequests).toHaveBeenCalled())
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm save request' }))

      rerender(
        <PromptRequestPanel
          prompt={argPrompt}
          serverId="memory-mcp"
          activeTab="saved"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      expect(await screen.findByText('Request 1')).toBeInTheDocument()
    })

    it('disables the footer Save button when Raw JSON mode currently has invalid JSON', async () => {
      renderPanel(argPrompt)
      await waitFor(() => expect(getRequests).toHaveBeenCalled())
      fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
        target: { value: '{ not json' }
      })
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('Load copies the saved request into the Params form and switches to the Params tab', async () => {
      getRequests.mockResolvedValue({
        requests: [
          {
            id: '1',
            name: 'Happy path',
            args: { topic: 'mcp', tone: 'casual' },
            createdAt: 1,
            updatedAt: 1
          }
        ]
      })
      const { rerender } = render(
        <PromptRequestPanel
          prompt={argPrompt}
          serverId="memory-mcp"
          activeTab="saved"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      expect(await screen.findByText('Happy path')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Load' }))
      expect(mockOnTabChange).toHaveBeenCalledWith('params')

      rerender(
        <PromptRequestPanel
          prompt={argPrompt}
          serverId="memory-mcp"
          activeTab="params"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      expect(screen.getByRole('textbox', { name: 'topic' })).toHaveValue('mcp')
      expect(screen.getByRole('textbox', { name: 'tone' })).toHaveValue('casual')
    })

    it('Load is a copy, not a live binding — later form edits do not mutate the saved entry', async () => {
      getRequests.mockResolvedValue({
        requests: [
          { id: '1', name: 'Happy path', args: { topic: 'mcp' }, createdAt: 1, updatedAt: 1 }
        ]
      })
      const { rerender } = render(
        <PromptRequestPanel
          prompt={argPrompt}
          serverId="memory-mcp"
          activeTab="saved"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      expect(await screen.findByText('Happy path')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Load' }))

      rerender(
        <PromptRequestPanel
          prompt={argPrompt}
          serverId="memory-mcp"
          activeTab="params"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      fireEvent.change(screen.getByRole('textbox', { name: 'topic' }), {
        target: { value: 'changed' }
      })

      // Editing the live Params form after a Load must never call back into
      // saveRequests — only explicit Saved-tab actions persist.
      expect(saveRequests).not.toHaveBeenCalled()
    })

    it('editing a row inline persists the change after the debounce delay', async () => {
      getRequests.mockResolvedValue({
        requests: [
          { id: '1', name: 'Happy path', args: { topic: 'mcp' }, createdAt: 1, updatedAt: 1 }
        ]
      })
      renderPanel(argPrompt, { activeTab: 'saved' })
      expect(await screen.findByText('Happy path')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Happy path'))
      fireEvent.change(screen.getByRole('textbox', { name: 'topic' }), {
        target: { value: 'changed' }
      })

      expect(saveRequests).not.toHaveBeenCalled()
      await waitFor(
        () =>
          expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize', {
            requests: [
              expect.objectContaining({
                id: '1',
                args: expect.objectContaining({ topic: 'changed' })
              })
            ]
          }),
        { timeout: 2000 }
      )
    })

    it('renaming a saved request persists immediately', async () => {
      getRequests.mockResolvedValue({
        requests: [{ id: '1', name: 'Old name', args: {}, createdAt: 1, updatedAt: 1 }]
      })
      renderPanel(argPrompt, { activeTab: 'saved' })
      expect(await screen.findByText('Old name')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Rename Old name' }))
      const input = screen.getByRole('textbox', { name: 'Rename saved request' })
      fireEvent.change(input, { target: { value: 'New name' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByText('New name')).toBeInTheDocument()
      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize', {
        requests: [expect.objectContaining({ id: '1', name: 'New name' })]
      })
    })

    it('deleting the only saved request persists and shows the empty state again', async () => {
      getRequests.mockResolvedValue({
        requests: [{ id: '1', name: 'Only one', args: {}, createdAt: 1, updatedAt: 1 }]
      })
      renderPanel(argPrompt, { activeTab: 'saved' })
      expect(await screen.findByText('Only one')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Delete Only one' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize', {
        requests: []
      })
      expect(await screen.findByText(/No saved requests yet/)).toBeInTheDocument()
    })

    it('marking a request "use for tests" persists and shows the caption', async () => {
      getRequests.mockResolvedValue({
        requests: [{ id: '1', name: 'Happy path', args: {}, createdAt: 1, updatedAt: 1 }]
      })
      renderPanel(argPrompt, { activeTab: 'saved' })
      expect(await screen.findByText('Happy path')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Use Happy path for tests' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize', {
        requests: [expect.objectContaining({ id: '1' })],
        testRequestId: '1'
      })
      expect(
        await screen.findByText('Automated test runs use "Happy path" for this capability.')
      ).toBeInTheDocument()
    })

    it('clicking the already-marked request unmarks it', async () => {
      getRequests.mockResolvedValue({
        requests: [{ id: '1', name: 'Happy path', args: {}, createdAt: 1, updatedAt: 1 }],
        testRequestId: '1'
      })
      renderPanel(argPrompt, { activeTab: 'saved' })
      expect(await screen.findByText('Happy path')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Stop using Happy path for tests' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize', {
        requests: [expect.objectContaining({ id: '1' })],
        testRequestId: undefined
      })
      expect(
        screen.queryByText('Automated test runs use "Happy path" for this capability.')
      ).not.toBeInTheDocument()
    })

    it('marking a different request switches the mark (only one at a time)', async () => {
      getRequests.mockResolvedValue({
        requests: [
          { id: '1', name: 'First', args: {}, createdAt: 1, updatedAt: 1 },
          { id: '2', name: 'Second', args: {}, createdAt: 1, updatedAt: 1 }
        ],
        testRequestId: '1'
      })
      renderPanel(argPrompt, { activeTab: 'saved' })
      expect(await screen.findByText('First')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Use Second for tests' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize', {
        requests: [expect.objectContaining({ id: '1' }), expect.objectContaining({ id: '2' })],
        testRequestId: '2'
      })
      expect(
        await screen.findByText('Automated test runs use "Second" for this capability.')
      ).toBeInTheDocument()
    })

    it('deleting the marked request clears the mark and its caption', async () => {
      getRequests.mockResolvedValue({
        requests: [{ id: '1', name: 'Happy path', args: {}, createdAt: 1, updatedAt: 1 }],
        testRequestId: '1'
      })
      renderPanel(argPrompt, { activeTab: 'saved' })
      expect(
        await screen.findByText('Automated test runs use "Happy path" for this capability.')
      ).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Delete Happy path' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'prompt', 'summarize', {
        requests: [],
        testRequestId: undefined
      })
    })
  })
})
