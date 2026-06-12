import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ElicitationModal } from './ElicitationModal'
import { useServerStore } from '../../stores/serverStore'
import type { ElicitationRequestEvent } from '../../../shared/mcp.types'

function request(
  requestedSchema: ElicitationRequestEvent['params']['requestedSchema']
): ElicitationRequestEvent {
  return {
    callId: 'call-1',
    elicitationId: 'elic-1',
    serverName: 'Test Server',
    toolName: 'ask_name',
    params: { message: 'What is your name?', requestedSchema }
  }
}

const formRequest = request({
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    age: { type: 'integer' },
    subscribe: { type: 'boolean', default: true }
  },
  required: ['name']
})

const mockRespond = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockRespond.mockResolvedValue(undefined)
  useServerStore.setState({ respondToElicitation: mockRespond })
})

describe('ElicitationModal — rendering', () => {
  it('shows the message and the server/tool context', () => {
    render(<ElicitationModal request={formRequest} />)
    expect(screen.getByText('What is your name?')).toBeInTheDocument()
    expect(screen.getByText('Test Server · during ask_name')).toBeInTheDocument()
  })

  it('renders fields with schema titles and boolean defaults applied', () => {
    render(<ElicitationModal request={formRequest} />)
    // Label prefers the schema title; the input keeps the property name.
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'name' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'age' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'subscribe' })).toBeChecked()
  })
})

describe('ElicitationModal — responses', () => {
  it('disables Accept while a required field is empty', () => {
    render(<ElicitationModal request={formRequest} />)
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled()
  })

  it('accepts with the coerced form content', () => {
    render(<ElicitationModal request={formRequest} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'name' }), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'age' }), { target: { value: '36' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(mockRespond).toHaveBeenCalledWith('elic-1', {
      action: 'accept',
      content: { name: 'Ada', age: 36, subscribe: true }
    })
  })

  it('declines without content', () => {
    render(<ElicitationModal request={formRequest} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(mockRespond).toHaveBeenCalledWith('elic-1', { action: 'decline' })
  })

  it('cancels via the Cancel button', () => {
    render(<ElicitationModal request={formRequest} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockRespond).toHaveBeenCalledWith('elic-1', { action: 'cancel' })
  })

  it('cancels on Escape', () => {
    render(<ElicitationModal request={formRequest} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockRespond).toHaveBeenCalledWith('elic-1', { action: 'cancel' })
  })

  it('responds at most once', () => {
    render(<ElicitationModal request={formRequest} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockRespond).toHaveBeenCalledTimes(1)
  })
})

describe('ElicitationModal — non-primitive schema fallback', () => {
  const complexRequest = request({
    type: 'object',
    properties: { tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } } }
  })

  it('falls back to a JSON textarea and accepts the parsed object', () => {
    render(<ElicitationModal request={complexRequest} />)
    const textarea = screen.getByRole('textbox', { name: 'Response JSON' })
    fireEvent.change(textarea, { target: { value: '{"tags": ["a"]}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(mockRespond).toHaveBeenCalledWith('elic-1', {
      action: 'accept',
      content: { tags: ['a'] }
    })
  })

  it('disables Accept while the JSON is invalid', () => {
    render(<ElicitationModal request={complexRequest} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Response JSON' }), {
      target: { value: '{ broken' }
    })
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled()
  })
})
