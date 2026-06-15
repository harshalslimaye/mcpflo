import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RequestPanel } from './RequestPanel'
import type { Tool } from '../../../shared/mcp.types'

function tool(inputSchema: Tool['inputSchema']): Tool {
  return { name: 'search_tool', inputSchema }
}

const primitiveTool = tool({
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search text' },
    limit: { type: 'integer' },
    verbose: { type: 'boolean' },
    mode: { enum: ['fast', 'slow'] }
  },
  required: ['query']
})

const mockOnExecute = vi.fn()
const mockOnTabChange = vi.fn()

function renderPanel(
  t: Tool,
  props: Partial<React.ComponentProps<typeof RequestPanel>> = {}
): ReturnType<typeof render> {
  return render(
    <RequestPanel
      tool={t}
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

describe('RequestPanel — form rendering', () => {
  it('renders an input for each primitive kind', () => {
    renderPanel(primitiveTool)
    expect(screen.getByRole('textbox', { name: 'query' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'limit' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'verbose' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'mode' })).toBeInTheDocument()
  })

  it('shows the property description as helper text', () => {
    renderPanel(primitiveTool)
    expect(screen.getByText('Search text')).toBeInTheDocument()
  })

  it('marks the single required field with an asterisk', () => {
    renderPanel(primitiveTool)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('uses a Select… placeholder for a required enum and (none) for an optional one', () => {
    renderPanel(
      tool({
        type: 'object',
        properties: { must: { enum: ['a', 'b'] }, may: { enum: ['c', 'd'] } },
        required: ['must']
      })
    )
    expect(screen.getByRole('option', { name: 'Select…' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '(none)' })).toBeInTheDocument()
  })

  it('renders a non-integer number field with step="any"', () => {
    renderPanel(tool({ type: 'object', properties: { amount: { type: 'number' } } }))
    expect(screen.getByRole('spinbutton', { name: 'amount' })).toHaveAttribute('step', 'any')
  })

  it('shows the Params/Schema tabs and the Execute button in the panel', () => {
    renderPanel(primitiveTool)
    expect(screen.getByRole('button', { name: 'Params' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schema' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Execute/ })).toBeInTheDocument()
  })

  it('reports tab changes through onTabChange', () => {
    renderPanel(primitiveTool)
    fireEvent.click(screen.getByRole('button', { name: 'Schema' }))
    expect(mockOnTabChange).toHaveBeenCalledWith('schema')
  })

  it('renders the raw schema on the Schema tab', () => {
    renderPanel(primitiveTool, { activeTab: 'schema' })
    expect(screen.getByText(/"query"/)).toBeInTheDocument()
  })
})

describe('RequestPanel — validation', () => {
  it('disables Execute and shows a required error when a required field is empty', () => {
    renderPanel(primitiveTool)
    expect(screen.getByText(/query is required/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Execute/ })).toBeDisabled()
  })

  it('enables Execute once the required field is filled', () => {
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'cats' } })
    expect(screen.queryByText(/query is required/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Execute/ })).toBeEnabled()
  })

  it('shows an inline error for a non-integer value in an integer field', () => {
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'x' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'limit' }), {
      target: { value: '2.5' }
    })
    expect(screen.getByText(/whole number/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Execute/ })).toBeDisabled()
  })
})

describe('RequestPanel — execution', () => {
  it('executes from raw-JSON mode with the parsed object as payload', () => {
    renderPanel(primitiveTool)
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{"query": "from json", "limit": 3}' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Execute/ }))
    expect(mockOnExecute).toHaveBeenCalledWith({ query: 'from json', limit: 3 })
  })

  it('selects an enum value and includes it in the payload', () => {
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'mode' }), { target: { value: 'fast' } })
    fireEvent.click(screen.getByRole('button', { name: /Execute/ }))
    expect(mockOnExecute).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'hi', mode: 'fast' })
    )
  })

  it('calls onExecute with the assembled params', () => {
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /Execute/ }))
    expect(mockOnExecute).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'hi', verbose: false })
    )
  })

  it('shows an Executing… label and disables Execute while running', () => {
    renderPanel(primitiveTool, { running: true })
    expect(screen.getByRole('button', { name: 'Executing…' })).toBeDisabled()
  })
})

describe('RequestPanel — no parameters', () => {
  it('shows a message, keeps Execute enabled, and executes with an empty object', () => {
    renderPanel(tool({ type: 'object' }))
    expect(screen.getByText('This tool takes no parameters.')).toBeInTheDocument()
    const execute = screen.getByRole('button', { name: /Execute/ })
    expect(execute).toBeEnabled()
    fireEvent.click(execute)
    expect(mockOnExecute).toHaveBeenCalledWith({})
  })
})

describe('RequestPanel — raw JSON toggle', () => {
  it('rejects valid JSON that is not an object and disables Execute', () => {
    renderPanel(primitiveTool)
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '[1, 2]' }
    })
    expect(screen.getByText('Expected a JSON object')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Execute/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    expect(screen.getByRole('textbox', { name: 'Params JSON' })).toBeInTheDocument()
  })

  it('serializes current form values when switching form → JSON', () => {
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    const textarea = screen.getByRole('textbox', { name: 'Params JSON' }) as HTMLTextAreaElement
    expect(textarea.value).toContain('"query": "hi"')
  })

  it('blocks the switch back to form and shows an error for invalid JSON', () => {
    renderPanel(primitiveTool)
    const toggle = screen.getByRole('switch', { name: 'Edit as raw JSON' })
    fireEvent.click(toggle)
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{ not valid' }
    })
    fireEvent.click(toggle)
    expect(screen.getByRole('textbox', { name: 'Params JSON' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'query' })).not.toBeInTheDocument()
  })

  it('parses valid JSON back into the form', () => {
    renderPanel(primitiveTool)
    const toggle = screen.getByRole('switch', { name: 'Edit as raw JSON' })
    fireEvent.click(toggle)
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{"query":"zzz"}' }
    })
    fireEvent.click(toggle)
    expect((screen.getByRole('textbox', { name: 'query' }) as HTMLInputElement).value).toBe('zzz')
  })
})

describe('RequestPanel — prefill from history', () => {
  it('populates each form field from the prefill arguments', () => {
    renderPanel(primitiveTool, { prefill: { args: { query: 'hello', limit: 5 }, nonce: 1 } })
    expect((screen.getByRole('textbox', { name: 'query' }) as HTMLInputElement).value).toBe('hello')
    expect((screen.getByRole('spinbutton', { name: 'limit' }) as HTMLInputElement).value).toBe('5')
  })

  it('does not affect the Raw JSON toggle — the form stays in form mode', () => {
    renderPanel(primitiveTool, { prefill: { args: { query: 'x' }, nonce: 1 } })
    expect(screen.queryByRole('textbox', { name: 'Params JSON' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'query' })).toBeInTheDocument()
  })

  it('does not auto-execute on prefill', () => {
    renderPanel(primitiveTool, { prefill: { args: { query: 'hi' }, nonce: 1 } })
    expect(mockOnExecute).not.toHaveBeenCalled()
  })

  it('re-applies the same record on a new nonce, discarding the user edit', () => {
    const { rerender } = renderPanel(primitiveTool, {
      prefill: { args: { query: 'first' }, nonce: 1 }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), {
      target: { value: 'edited' }
    })
    rerender(
      <RequestPanel
        tool={primitiveTool}
        activeTab="params"
        onTabChange={mockOnTabChange}
        running={false}
        onExecute={mockOnExecute}
        prefill={{ args: { query: 'first' }, nonce: 2 }}
      />
    )
    expect((screen.getByRole('textbox', { name: 'query' }) as HTMLInputElement).value).toBe('first')
  })
})

describe('RequestPanel — non-primitive schema', () => {
  const complexTool = tool({
    type: 'object',
    properties: {
      name: { type: 'string' },
      filters: { type: 'object', properties: {} }
    },
    required: []
  })

  it('defaults to JSON mode with the toggle locked', () => {
    renderPanel(complexTool)
    expect(screen.getByRole('textbox', { name: 'Params JSON' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Edit as raw JSON' })).toBeDisabled()
    expect(screen.getByText(/complex parameters/i)).toBeInTheDocument()
  })
})
