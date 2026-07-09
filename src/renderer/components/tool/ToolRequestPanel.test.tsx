import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolRequestPanel } from './ToolRequestPanel'
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
  props: Partial<React.ComponentProps<typeof ToolRequestPanel>> = {}
): ReturnType<typeof render> {
  return render(
    <ToolRequestPanel
      tool={t}
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

describe('ToolRequestPanel — form rendering', () => {
  it('renders an input for each primitive kind', () => {
    renderPanel(primitiveTool)
    expect(screen.getByRole('textbox', { name: 'query' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'limit' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'verbose' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'mode' })).toBeInTheDocument()
  })

  it('exposes the property description via a help tooltip', async () => {
    renderPanel(primitiveTool)
    const help = screen.getAllByRole('button', { name: 'Field help' })[0]
    fireEvent.focus(help)
    expect(await screen.findByText('Search text')).toBeInTheDocument()
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

describe('ToolRequestPanel — validation', () => {
  it('disables Execute while a required field is empty', () => {
    renderPanel(primitiveTool)
    expect(screen.getByRole('button', { name: /Execute/ })).toBeDisabled()
  })

  it('enables Execute once the required field is filled', () => {
    renderPanel(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'cats' } })
    expect(screen.getByRole('button', { name: /Execute/ })).toBeEnabled()
  })

  it('shows an inline error for a non-integer value once the field is blurred', () => {
    renderPanel(primitiveTool)
    const limit = screen.getByRole('spinbutton', { name: 'limit' })
    fireEvent.change(limit, { target: { value: '2.5' } })
    fireEvent.blur(limit)
    expect(screen.getByText(/must be integer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Execute/ })).toBeDisabled()
  })

  it('keeps a field’s required error hidden until that field is blurred', () => {
    renderPanel(primitiveTool)
    // Editing another field triggers validation, so query's required error now
    // exists — but query is untouched, so it stays hidden (no all-at-once flash).
    fireEvent.change(screen.getByRole('spinbutton', { name: 'limit' }), { target: { value: '3' } })
    expect(screen.queryByText(/required property 'query'/i)).not.toBeInTheDocument()

    // Blurring query reveals its own error.
    const query = screen.getByRole('textbox', { name: 'query' })
    fireEvent.focus(query)
    fireEvent.blur(query)
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

describe('ToolRequestPanel — execution', () => {
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

describe('ToolRequestPanel — no parameters', () => {
  it('shows a message, keeps Execute enabled, and executes with an empty object', () => {
    renderPanel(tool({ type: 'object' }))
    expect(screen.getByText('This tool takes no parameters.')).toBeInTheDocument()
    const execute = screen.getByRole('button', { name: /Execute/ })
    expect(execute).toBeEnabled()
    fireEvent.click(execute)
    expect(mockOnExecute).toHaveBeenCalledWith({})
  })
})

describe('ToolRequestPanel — raw JSON toggle', () => {
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

describe('ToolRequestPanel — prefill from history', () => {
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
      <ToolRequestPanel
        tool={primitiveTool}
        serverId="memory-mcp"
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

describe('ToolRequestPanel — complex schema (now form-editable)', () => {
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

  it('renders an array of objects as a collapsible "name #N" card', () => {
    renderPanel(
      tool({
        type: 'object',
        properties: {
          volumes: {
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' } } }
          }
        }
      })
    )
    // Adding the first item produces a card headed by the array name + index.
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    expect(screen.getByText('volumes #1')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'name' })).toBeInTheDocument()

    // The header toolbar collapses and re-expands the card body.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse item' }))
    expect(screen.queryByRole('textbox', { name: 'name' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand item' }))
    expect(screen.getByRole('textbox', { name: 'name' })).toBeInTheDocument()
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

describe('ToolRequestPanel — Tokens tab', () => {
  it('offers a Tokens tab alongside Params and Schema', () => {
    renderPanel(primitiveTool)
    expect(screen.getByRole('button', { name: 'Params' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schema' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tokens' })).toBeInTheDocument()
  })

  it('renders the definition footprint, independent of the form state', () => {
    renderPanel(primitiveTool, { activeTab: 'tokens' })
    expect(screen.getByText('Definition footprint')).toBeInTheDocument()
    expect(screen.getByText('Context impact')).toBeInTheDocument()
  })

  it('does not show the Raw JSON toggle on the Tokens tab', () => {
    renderPanel(primitiveTool, { activeTab: 'tokens' })
    expect(screen.queryByLabelText('Edit as raw JSON')).not.toBeInTheDocument()
  })

  it('switches to the Tokens tab when clicked', () => {
    renderPanel(primitiveTool)
    fireEvent.click(screen.getByRole('button', { name: 'Tokens' }))
    expect(mockOnTabChange).toHaveBeenCalledWith('tokens')
  })
})

describe('ToolRequestPanel — Tests tab', () => {
  it('offers a Tests tab alongside Params, Schema, and Tokens', () => {
    renderPanel(primitiveTool)
    expect(screen.getByRole('button', { name: 'Tests' })).toBeInTheDocument()
  })

  it('switches to the Tests tab when clicked', () => {
    renderPanel(primitiveTool)
    fireEvent.click(screen.getByRole('button', { name: 'Tests' }))
    expect(mockOnTabChange).toHaveBeenCalledWith('tests')
  })

  it('renders the script editor without throwing when window.api.testing is unavailable', () => {
    // No window.api stub in this file's tests — the panel must degrade to an
    // empty, unsaved script rather than crash.
    expect(window.api).toBeUndefined()
    renderPanel(primitiveTool, { activeTab: 'tests' })
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

    it('loads the saved script for this tool on mount', async () => {
      getScript.mockResolvedValue('test("a", function () {})')
      renderPanel(primitiveTool, { activeTab: 'tests' })
      await waitFor(() =>
        expect(getScript).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool')
      )
      // CodeMirror's syntax highlighting splits the line across sibling spans,
      // so read the editor's plain text rather than screen.findByText.
      await waitFor(() =>
        expect(document.querySelector('.cm-content')?.textContent).toBe('test("a", function () {})')
      )
    })

    it('shows the dot indicator once a non-empty saved script loads', async () => {
      getScript.mockResolvedValue('test("a", function () {})')
      renderPanel(primitiveTool)
      expect(await screen.findByLabelText('Has a saved test script')).toBeInTheDocument()
    })

    it('shows no dot indicator when there is no saved script', async () => {
      getScript.mockResolvedValue(null)
      renderPanel(primitiveTool)
      await waitFor(() => expect(getScript).toHaveBeenCalled())
      expect(screen.queryByLabelText('Has a saved test script')).not.toBeInTheDocument()
    })

    it('autosaves an edited script after the debounce delay', async () => {
      const user = userEvent.setup()
      renderPanel(primitiveTool, { activeTab: 'tests' })
      await waitFor(() => expect(getScript).toHaveBeenCalled())

      const editable = document.querySelector('.cm-content') as HTMLElement
      editable.focus()
      await user.type(editable, 'x')

      expect(saveScript).not.toHaveBeenCalled()
      await waitFor(
        () => expect(saveScript).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool', 'x'),
        {
          timeout: 2000
        }
      )
    })

    it('does not re-save the just-loaded script back to disk on mount', async () => {
      getScript.mockResolvedValue('test("a", function () {})')
      renderPanel(primitiveTool, { activeTab: 'tests' })
      await waitFor(() =>
        expect(document.querySelector('.cm-content')?.textContent).toBe('test("a", function () {})')
      )
      // Give the debounce window a chance to fire if it (incorrectly) had been
      // scheduled on load.
      await new Promise((resolve) => setTimeout(resolve, 700))
      expect(saveScript).not.toHaveBeenCalled()
    })
  })
})

describe('ToolRequestPanel — Saved tab', () => {
  it('offers a Saved tab alongside Params, Schema, Tokens, and Tests', () => {
    renderPanel(primitiveTool)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('switches to the Saved tab when clicked', () => {
    renderPanel(primitiveTool)
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    expect(mockOnTabChange).toHaveBeenCalledWith('saved')
  })

  it('renders the Saved tab without throwing when window.api.testing is unavailable', () => {
    // No window.api stub in this file's tests — the panel must degrade to an
    // empty, unloaded list rather than crash.
    expect(window.api).toBeUndefined()
    renderPanel(primitiveTool, { activeTab: 'saved' })
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
      renderPanel(primitiveTool, { activeTab: 'saved' })
      await waitFor(() =>
        expect(getRequests).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool')
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
      renderPanel(primitiveTool)
      expect(await screen.findByText('(2)')).toBeInTheDocument()
    })

    it('shows no count badge when there are no saved requests', async () => {
      renderPanel(primitiveTool)
      await waitFor(() => expect(getRequests).toHaveBeenCalled())
      expect(screen.queryByText(/^\(\d+\)$/)).not.toBeInTheDocument()
    })

    it('the footer Save button snapshots the live Params form and persists it', async () => {
      const { rerender } = render(
        <ToolRequestPanel
          tool={primitiveTool}
          serverId="memory-mcp"
          activeTab="params"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      await waitFor(() => expect(getRequests).toHaveBeenCalled())
      fireEvent.change(screen.getByRole('textbox', { name: 'query' }), {
        target: { value: 'hello' }
      })

      // The Save button lives in the footer next to Execute — no need to
      // navigate to the Saved tab first.
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'New saved request name' }), {
        target: { value: 'Happy path' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm save request' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool', {
        requests: [
          expect.objectContaining({
            name: 'Happy path',
            args: expect.objectContaining({ query: 'hello' })
          })
        ]
      })

      rerender(
        <ToolRequestPanel
          tool={primitiveTool}
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
        <ToolRequestPanel
          tool={primitiveTool}
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
        <ToolRequestPanel
          tool={primitiveTool}
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
      renderPanel(primitiveTool)
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
            args: { query: 'hello', limit: 5 },
            createdAt: 1,
            updatedAt: 1
          }
        ]
      })
      const { rerender } = render(
        <ToolRequestPanel
          tool={primitiveTool}
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
        <ToolRequestPanel
          tool={primitiveTool}
          serverId="memory-mcp"
          activeTab="params"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      expect(screen.getByRole('textbox', { name: 'query' })).toHaveValue('hello')
      expect(screen.getByRole('spinbutton', { name: 'limit' })).toHaveValue(5)
    })

    it('Load is a copy, not a live binding — later form edits do not mutate the saved entry', async () => {
      getRequests.mockResolvedValue({
        requests: [
          { id: '1', name: 'Happy path', args: { query: 'hello' }, createdAt: 1, updatedAt: 1 }
        ]
      })
      const { rerender } = render(
        <ToolRequestPanel
          tool={primitiveTool}
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
        <ToolRequestPanel
          tool={primitiveTool}
          serverId="memory-mcp"
          activeTab="params"
          onTabChange={mockOnTabChange}
          running={false}
          onExecute={mockOnExecute}
        />
      )
      fireEvent.change(screen.getByRole('textbox', { name: 'query' }), {
        target: { value: 'changed' }
      })

      // Editing the live Params form after a Load must never call back into
      // saveRequests — only explicit Saved-tab actions persist.
      expect(saveRequests).not.toHaveBeenCalled()
    })

    it('editing a row inline persists the change after the debounce delay', async () => {
      getRequests.mockResolvedValue({
        requests: [
          { id: '1', name: 'Happy path', args: { query: 'hello' }, createdAt: 1, updatedAt: 1 }
        ]
      })
      renderPanel(primitiveTool, { activeTab: 'saved' })
      expect(await screen.findByText('Happy path')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Happy path'))
      fireEvent.change(screen.getByRole('textbox', { name: 'query' }), {
        target: { value: 'goodbye' }
      })

      expect(saveRequests).not.toHaveBeenCalled()
      await waitFor(
        () =>
          expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool', {
            requests: [
              expect.objectContaining({
                id: '1',
                args: expect.objectContaining({ query: 'goodbye' })
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
      renderPanel(primitiveTool, { activeTab: 'saved' })
      expect(await screen.findByText('Old name')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Rename Old name' }))
      const input = screen.getByRole('textbox', { name: 'Rename saved request' })
      fireEvent.change(input, { target: { value: 'New name' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByText('New name')).toBeInTheDocument()
      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool', {
        requests: [expect.objectContaining({ id: '1', name: 'New name' })]
      })
    })

    it('deleting the only saved request persists and shows the empty state again', async () => {
      getRequests.mockResolvedValue({
        requests: [{ id: '1', name: 'Only one', args: {}, createdAt: 1, updatedAt: 1 }]
      })
      renderPanel(primitiveTool, { activeTab: 'saved' })
      expect(await screen.findByText('Only one')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Delete Only one' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool', {
        requests: []
      })
      expect(await screen.findByText(/No saved requests yet/)).toBeInTheDocument()
    })

    it('marking a request "use for tests" persists and shows the caption', async () => {
      getRequests.mockResolvedValue({
        requests: [{ id: '1', name: 'Happy path', args: {}, createdAt: 1, updatedAt: 1 }]
      })
      renderPanel(primitiveTool, { activeTab: 'saved' })
      expect(await screen.findByText('Happy path')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Use Happy path for tests' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool', {
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
      renderPanel(primitiveTool, { activeTab: 'saved' })
      expect(await screen.findByText('Happy path')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Stop using Happy path for tests' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool', {
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
      renderPanel(primitiveTool, { activeTab: 'saved' })
      expect(await screen.findByText('First')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Use Second for tests' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool', {
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
      renderPanel(primitiveTool, { activeTab: 'saved' })
      expect(
        await screen.findByText('Automated test runs use "Happy path" for this capability.')
      ).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Delete Happy path' }))

      expect(saveRequests).toHaveBeenCalledWith('memory-mcp', 'tool', 'search_tool', {
        requests: [],
        testRequestId: undefined
      })
    })
  })
})
