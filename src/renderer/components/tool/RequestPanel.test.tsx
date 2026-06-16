import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  it('disables Execute while a required field is empty', () => {
    renderPanel(primitiveTool)
    expect(screen.getByRole('button', { name: /Execute/ })).toBeDisabled()
  })

  it('enables Execute once the required field is filled', () => {
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'cats' } })
    expect(screen.getByRole('button', { name: /Execute/ })).toBeEnabled()
  })

  it('shows an inline error for a non-integer value in an integer field', () => {
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'x' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'limit' }), {
      target: { value: '2.5' }
    })
    expect(screen.getByText(/must be integer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Execute/ })).toBeDisabled()
  })

  it('surfaces a missing-required error after the form is touched', () => {
    renderPanel(primitiveTool)
    // liveValidate reports required errors once the user interacts.
    fireEvent.change(screen.getByRole('spinbutton', { name: 'limit' }), { target: { value: '3' } })
    expect(screen.getByText(/required property 'query'/i)).toBeInTheDocument()
  })

  it('does not let a string `format` block Execute (format is annotation-only)', () => {
    // A field that looks filled but whose value fails a strict `format` check
    // (e.g. uri/date-time/email) must not wedge the form — only required/type
    // are enforced. Regression for Execute staying disabled on real schemas.
    renderPanel(
      tool({
        type: 'object',
        properties: {
          name: { type: 'string' },
          endpoint: { type: 'string', format: 'uri' },
          when: { type: 'string', format: 'date-time' }
        },
        required: ['name', 'endpoint']
      })
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'name' }), { target: { value: 'srv' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'endpoint' }), {
      target: { value: 'not-a-uri' }
    })
    expect(screen.getByRole('button', { name: /Execute/ })).toBeEnabled()
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

  it('selects an enum value and includes it in the payload', async () => {
    const user = userEvent.setup()
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'mode' }), 'fast')
    fireEvent.click(screen.getByRole('button', { name: /Execute/ }))
    expect(mockOnExecute).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'hi', mode: 'fast' })
    )
  })

  it('calls onExecute with the assembled params', () => {
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /Execute/ }))
    expect(mockOnExecute).toHaveBeenCalledWith(expect.objectContaining({ query: 'hi' }))
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

describe('RequestPanel — complex schema (now form-editable)', () => {
  it('renders a form for a nested-object schema instead of locking to JSON', () => {
    renderPanel(
      tool({
        type: 'object',
        properties: {
          name: { type: 'string' },
          filters: { type: 'object', properties: { active: { type: 'boolean' } } }
        }
      })
    )
    // No JSON lock, no "complex parameters" fallback message.
    expect(screen.queryByText(/complex parameters/i)).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Edit as raw JSON' })).toBeEnabled()
    // Top-level and nested fields both render.
    expect(screen.getByRole('textbox', { name: 'name' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'active' })).toBeInTheDocument()
  })

  it('renders an add-item control for an array schema', () => {
    renderPanel(
      tool({ type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } })
    )
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
  })

  it('renders a JSON editor for a required untyped ("any") property and can satisfy it', () => {
    // Untyped schemas render no widget in stock RJSF, which would make a required
    // "any" property impossible to fill and wedge Execute. Regression.
    renderPanel(
      tool({
        type: 'object',
        properties: { data: {}, name: { type: 'string' } },
        required: ['data', 'name']
      })
    )
    const dataField = screen.getByRole('textbox', { name: 'data' })
    expect(dataField).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Execute/ })).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: 'name' }), { target: { value: 'srv' } })
    fireEvent.change(dataField, { target: { value: '{"k":1}' } })
    expect(screen.getByRole('button', { name: /Execute/ })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /Execute/ }))
    expect(mockOnExecute).toHaveBeenCalledWith({ name: 'srv', data: { k: 1 } })
  })

  it('does not require touching a required boolean (seeded to false)', () => {
    renderPanel(
      tool({
        type: 'object',
        properties: { enabled: { type: 'boolean' }, name: { type: 'string' } },
        required: ['enabled', 'name']
      })
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'name' }), { target: { value: 'x' } })
    expect(screen.getByRole('button', { name: /Execute/ })).toBeEnabled()
  })

  it('validates a draft-07 schema (the dialect official MCP servers emit)', () => {
    // Regression: a draft-07 `$schema` must validate. A 2020-only validator
    // returns false with an empty error list, wedging Execute with no visible
    // reason even when every required field is filled.
    renderPanel(
      tool({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { message: { type: 'string', description: 'Message to echo' } },
        required: ['message']
      } as Tool['inputSchema'])
    )
    expect(screen.getByRole('button', { name: /Execute/ })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'message' }), { target: { value: 'hi' } })
    expect(screen.getByRole('button', { name: /Execute/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /Execute/ }))
    expect(mockOnExecute).toHaveBeenCalledWith({ message: 'hi' })
  })
})
