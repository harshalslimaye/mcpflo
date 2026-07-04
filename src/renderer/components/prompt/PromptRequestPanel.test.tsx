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
        value: { testing: { getScript, saveScript, saveInputs: vi.fn(), run: vi.fn() } }
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
