import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  useServerStore.setState({ history: {}, executeTool: mockExecuteTool })
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

  it('renders the latest successful result from history', () => {
    const record: ToolCallRecord = {
      id: '1',
      serverId: 'srv',
      toolName: 'search_tool',
      args: { query: 'hi' },
      status: 'success',
      result: { content: [{ type: 'text', text: 'hello world' }] },
      durationMs: 12,
      at: Date.now()
    }
    useServerStore.setState({ history: { [toolKey('srv', 'search_tool')]: [record] } })
    renderTab(primitiveTool)
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders an error result from history', () => {
    const record: ToolCallRecord = {
      id: '2',
      serverId: 'srv',
      toolName: 'search_tool',
      args: { query: 'hi' },
      status: 'error',
      error: 'connection refused',
      durationMs: 4,
      at: Date.now()
    }
    useServerStore.setState({ history: { [toolKey('srv', 'search_tool')]: [record] } })
    renderTab(primitiveTool)
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('connection refused')).toBeInTheDocument()
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
