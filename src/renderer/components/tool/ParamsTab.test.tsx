import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ParamsTab } from './ParamsTab'
import { useServerStore, toolKey, type ToolCallRecord } from '../../stores/serverStore'
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

const mockExecuteTool = vi.fn()

function renderTab(t: Tool): ReturnType<typeof render> {
  return render(<ParamsTab tool={t} serverId="srv" />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExecuteTool.mockResolvedValue(undefined)
  useServerStore.setState({ history: {}, liveNotifications: {}, executeTool: mockExecuteTool })
})

describe('ParamsTab — form rendering', () => {
  it('renders an input for each primitive kind', () => {
    renderTab(primitiveTool)
    expect(screen.getByRole('textbox', { name: 'query' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'limit' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'verbose' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'mode' })).toBeInTheDocument()
  })

  it('shows the property description as helper text', () => {
    renderTab(primitiveTool)
    expect(screen.getByText('Search text')).toBeInTheDocument()
  })

  it('marks the single required field with an asterisk', () => {
    renderTab(primitiveTool)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('uses a Select… placeholder for a required enum and (none) for an optional one', () => {
    renderTab(
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
    renderTab(tool({ type: 'object', properties: { amount: { type: 'number' } } }))
    expect(screen.getByRole('spinbutton', { name: 'amount' })).toHaveAttribute('step', 'any')
  })

  it('constrains the form column to max-w-2xl with the Execute button inside it', () => {
    const { container } = renderTab(primitiveTool)
    const column = container.firstChild as HTMLElement
    expect(column).toHaveClass('max-w-2xl')
    expect(column).toContainElement(screen.getByRole('button', { name: 'Execute' }))
  })
})

describe('ParamsTab — validation', () => {
  it('disables Execute and shows a required error when a required field is empty', () => {
    renderTab(primitiveTool)
    expect(screen.getByText(/query is required/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Execute' })).toBeDisabled()
  })

  it('enables Execute once the required field is filled', () => {
    renderTab(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), {
      target: { value: 'cats' }
    })
    expect(screen.queryByText(/query is required/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Execute' })).toBeEnabled()
  })

  it('shows an inline error for a non-integer value in an integer field', () => {
    renderTab(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'x' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'limit' }), {
      target: { value: '2.5' }
    })
    expect(screen.getByText(/whole number/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Execute' })).toBeDisabled()
  })
})

describe('ParamsTab — execution', () => {
  it('executes from raw-JSON mode with the parsed object as payload', () => {
    renderTab(primitiveTool)
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{"query": "from json", "limit": 3}' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(mockExecuteTool).toHaveBeenCalledWith('srv', 'search_tool', {
      query: 'from json',
      limit: 3
    })
  })

  it('selects an enum value and includes it in the payload', () => {
    renderTab(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'mode' }), {
      target: { value: 'fast' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'srv',
      'search_tool',
      expect.objectContaining({ query: 'hi', mode: 'fast' })
    )
  })

  it('calls executeTool with the assembled params', () => {
    renderTab(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'srv',
      'search_tool',
      expect.objectContaining({ query: 'hi', verbose: false })
    )
  })

  it('shows an Executing… state while a call is in flight', () => {
    mockExecuteTool.mockReturnValue(new Promise(() => {})) // never resolves
    renderTab(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(screen.getByRole('button', { name: 'Executing…' })).toBeDisabled()
  })

  it('shows the result section with all tabs while a call is in flight', () => {
    mockExecuteTool.mockReturnValue(new Promise(() => {})) // never resolves
    renderTab(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    expect(screen.getByText('Result')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raw' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('feeds live notifications into the Notifications tab label during a call', () => {
    mockExecuteTool.mockReturnValue(new Promise(() => {})) // never resolves
    renderTab(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    const frame = { method: 'notifications/progress', params: { progress: 1 }, at: Date.now() }
    act(() => {
      useServerStore.setState({
        liveNotifications: { [toolKey('srv', 'search_tool')]: [frame, frame] }
      })
    })
    expect(screen.getByRole('button', { name: 'Notifications (2)' })).toBeInTheDocument()
  })

  it('renders the latest successful result from history', () => {
    const record: ToolCallRecord = {
      id: '1',
      serverId: 'srv',
      toolName: 'search_tool',
      args: { query: 'hi' },
      status: 'success',
      response: {
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'hello world' }] }
      },
      notifications: [],
      durationMs: 12,
      at: Date.now()
    }
    useServerStore.setState({ history: { [toolKey('srv', 'search_tool')]: [record] } })
    const { container } = renderTab(primitiveTool)
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(container.textContent).toContain('hello world')
  })

  it('renders an error result from history', () => {
    const record: ToolCallRecord = {
      id: '2',
      serverId: 'srv',
      toolName: 'search_tool',
      args: { query: 'hi' },
      status: 'error',
      error: 'connection refused',
      notifications: [],
      durationMs: 4,
      at: Date.now()
    }
    useServerStore.setState({ history: { [toolKey('srv', 'search_tool')]: [record] } })
    renderTab(primitiveTool)
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('connection refused')).toBeInTheDocument()
  })

  it('defaults the result viewer to the Preview tab', () => {
    const record: ToolCallRecord = {
      id: 'p',
      serverId: 'srv',
      toolName: 'search_tool',
      args: {},
      status: 'success',
      response: { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'hi' }] } },
      notifications: [],
      durationMs: 5,
      at: Date.now()
    }
    useServerStore.setState({ history: { [toolKey('srv', 'search_tool')]: [record] } })
    renderTab(primitiveTool)
    expect(screen.getByRole('button', { name: 'Preview' }).className).toContain('border-accent')
  })

  it('keeps the selected result tab across executions', () => {
    const key = toolKey('srv', 'search_tool')
    const recA: ToolCallRecord = {
      id: 'a',
      serverId: 'srv',
      toolName: 'search_tool',
      args: { query: 'a' },
      status: 'success',
      response: { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'A' }] } },
      notifications: [],
      durationMs: 5,
      at: Date.now()
    }
    useServerStore.setState({ history: { [key]: [recA] } })
    renderTab(primitiveTool)

    // Switch the result viewer off the default (Preview) onto the Raw tab.
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    expect(screen.getByRole('button', { name: 'Raw' }).className).toContain('border-accent')

    // Simulate a fresh execution prepending a new record.
    const recB: ToolCallRecord = {
      ...recA,
      id: 'b',
      response: { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'B' }] } }
    }
    act(() => {
      useServerStore.setState({ history: { [key]: [recB, recA] } })
    })

    // Still on the Raw tab.
    expect(screen.getByRole('button', { name: 'Raw' }).className).toContain('border-accent')
  })
})

describe('ParamsTab — no parameters', () => {
  it('shows a message, keeps Execute enabled, and executes with an empty object', () => {
    renderTab(tool({ type: 'object' }))
    expect(screen.getByText('This tool takes no parameters.')).toBeInTheDocument()
    const execute = screen.getByRole('button', { name: 'Execute' })
    expect(execute).toBeEnabled()
    fireEvent.click(execute)
    expect(mockExecuteTool).toHaveBeenCalledWith('srv', 'search_tool', {})
  })
})

describe('ParamsTab — raw JSON toggle', () => {
  it('rejects valid JSON that is not an object and disables Execute', () => {
    renderTab(primitiveTool)
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '[1, 2]' }
    })
    expect(screen.getByText('Expected a JSON object')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Execute' })).toBeDisabled()

    // Switching back to the form is blocked while the JSON is not an object.
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    expect(screen.getByRole('textbox', { name: 'Params JSON' })).toBeInTheDocument()
  })

  it('serializes current form values when switching form → JSON', () => {
    renderTab(primitiveTool)
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    const textarea = screen.getByRole('textbox', { name: 'Params JSON' }) as HTMLTextAreaElement
    expect(textarea.value).toContain('"query": "hi"')
  })

  it('blocks the switch back to form and shows an error for invalid JSON', () => {
    renderTab(primitiveTool)
    const toggle = screen.getByRole('switch', { name: 'Edit as raw JSON' })
    fireEvent.click(toggle)
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{ not valid' }
    })
    fireEvent.click(toggle) // attempt JSON → form
    // Still in JSON mode (textarea present) and an error is shown.
    expect(screen.getByRole('textbox', { name: 'Params JSON' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'query' })).not.toBeInTheDocument()
  })

  it('parses valid JSON back into the form', () => {
    renderTab(primitiveTool)
    const toggle = screen.getByRole('switch', { name: 'Edit as raw JSON' })
    fireEvent.click(toggle)
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{"query":"zzz"}' }
    })
    fireEvent.click(toggle) // JSON → form
    expect((screen.getByRole('textbox', { name: 'query' }) as HTMLInputElement).value).toBe('zzz')
  })
})

describe('ParamsTab — prefill from history', () => {
  it('populates each form field from the prefill arguments', () => {
    render(
      <ParamsTab
        tool={primitiveTool}
        serverId="srv"
        prefill={{ args: { query: 'hello', limit: 5 }, nonce: 1 }}
      />
    )
    expect((screen.getByRole('textbox', { name: 'query' }) as HTMLInputElement).value).toBe('hello')
    expect((screen.getByRole('spinbutton', { name: 'limit' }) as HTMLInputElement).value).toBe('5')
  })

  it('does not affect the Raw JSON toggle — the form stays in form mode', () => {
    render(
      <ParamsTab tool={primitiveTool} serverId="srv" prefill={{ args: { query: 'x' }, nonce: 1 }} />
    )
    expect(screen.queryByRole('textbox', { name: 'Params JSON' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'query' })).toBeInTheDocument()
  })

  it('does not auto-execute on prefill', () => {
    render(
      <ParamsTab
        tool={primitiveTool}
        serverId="srv"
        prefill={{ args: { query: 'hi' }, nonce: 1 }}
      />
    )
    expect(mockExecuteTool).not.toHaveBeenCalled()
  })

  it('re-applies the same record on a new nonce, discarding the user edit', () => {
    const { rerender } = render(
      <ParamsTab
        tool={primitiveTool}
        serverId="srv"
        prefill={{ args: { query: 'first' }, nonce: 1 }}
      />
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'query' }), {
      target: { value: 'edited' }
    })
    rerender(
      <ParamsTab
        tool={primitiveTool}
        serverId="srv"
        prefill={{ args: { query: 'first' }, nonce: 2 }}
      />
    )
    expect((screen.getByRole('textbox', { name: 'query' }) as HTMLInputElement).value).toBe('first')
  })
})

describe('ParamsTab — non-primitive schema', () => {
  const complexTool = tool({
    type: 'object',
    properties: {
      name: { type: 'string' },
      filters: { type: 'object', properties: {} }
    },
    required: []
  })

  it('defaults to JSON mode with the toggle locked', () => {
    renderTab(complexTool)
    expect(screen.getByRole('textbox', { name: 'Params JSON' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Edit as raw JSON' })).toBeDisabled()
    expect(screen.getByText(/complex parameters/i)).toBeInTheDocument()
  })
})
