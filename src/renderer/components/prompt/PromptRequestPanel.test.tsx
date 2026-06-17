import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('shows the argument description as helper text', () => {
    renderPanel(argPrompt)
    expect(screen.getByText('What to summarize')).toBeInTheDocument()
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
