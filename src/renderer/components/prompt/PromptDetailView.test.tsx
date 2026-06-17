import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptDetailView } from './PromptDetailView'
import { useServerStore, promptKey, type PromptGetRecord } from '../../stores/serverStore'
import type { Prompt } from '../../../shared/mcp.types'

const prompt: Prompt = {
  name: 'summarize',
  description: 'Summarize a document',
  arguments: [{ name: 'topic', description: 'What to summarize', required: true }]
}

const mockGetPrompt = vi.fn()

function renderView(p: Prompt = prompt): ReturnType<typeof render> {
  return render(<PromptDetailView prompt={p} serverId="srv" serverName="Everything" />)
}

function successRecord(over: Partial<PromptGetRecord> = {}): PromptGetRecord {
  return {
    id: '1',
    serverId: 'srv',
    promptName: prompt.name,
    args: { topic: 'mcp' },
    status: 'success',
    response: {
      jsonrpc: '2.0',
      result: { messages: [{ role: 'user', content: { type: 'text', text: 'Summarize mcp' } }] }
    },
    durationMs: 8,
    at: Date.now(),
    ...over
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPrompt.mockResolvedValue(undefined)
  useServerStore.setState({ promptHistory: {}, getPrompt: mockGetPrompt })
})

describe('PromptDetailView — history selection', () => {
  it('shows the selected get’s response when a History entry is clicked', () => {
    const newest = successRecord({
      id: 'new',
      args: { topic: 'new' },
      response: {
        jsonrpc: '2.0',
        result: { messages: [{ role: 'user', content: { type: 'text', text: 'NEW MESSAGE' } }] }
      }
    })
    const older = successRecord({
      id: 'old',
      args: { topic: 'old' },
      response: {
        jsonrpc: '2.0',
        result: { messages: [{ role: 'user', content: { type: 'text', text: 'OLD MESSAGE' } }] }
      }
    })
    useServerStore.setState({ promptHistory: { [promptKey('srv', prompt.name)]: [newest, older] } })
    renderView()
    expect(screen.getByText('NEW MESSAGE')).toBeInTheDocument()
    fireEvent.click(screen.getByText('{"topic":"old"}'))
    expect(screen.getByText('OLD MESSAGE')).toBeInTheDocument()
    expect(screen.queryByText('NEW MESSAGE')).not.toBeInTheDocument()
  })

  it('drives the panel for a prompt with no arguments (no prefill path)', () => {
    const pingPrompt: Prompt = { name: 'ping' }
    const record = successRecord({
      promptName: 'ping',
      args: {},
      response: {
        jsonrpc: '2.0',
        result: { messages: [{ role: 'user', content: { type: 'text', text: 'PONG' } }] }
      }
    })
    useServerStore.setState({ promptHistory: { [promptKey('srv', 'ping')]: [record] } })
    render(<PromptDetailView prompt={pingPrompt} serverId="srv" serverName="Everything" />)
    // The arg-less entry is summarised as "no arguments" and is still clickable.
    const entry = screen.getByRole('button', { name: /no arguments/ })
    fireEvent.click(entry)
    expect(entry).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('PONG')).toBeInTheDocument()
  })
})

describe('PromptDetailView', () => {
  it('renders the header with name, server and argument count', () => {
    renderView()
    expect(screen.getByText('summarize')).toBeInTheDocument()
    expect(screen.getByText('Everything')).toBeInTheDocument()
    expect(screen.getByText('1 argument')).toBeInTheDocument()
    expect(screen.getByText('Summarize a document')).toBeInTheDocument()
  })

  it('calls getPrompt with the server id, name and args when Get Prompt is clicked', () => {
    renderView()
    fireEvent.change(screen.getByRole('textbox', { name: 'topic' }), { target: { value: 'mcp' } })
    fireEvent.click(screen.getByRole('button', { name: /Get Prompt/ }))
    expect(mockGetPrompt).toHaveBeenCalledWith('srv', 'summarize', { topic: 'mcp' })
  })

  it('shows a Getting… state while a get is in flight', () => {
    mockGetPrompt.mockReturnValue(new Promise(() => {})) // never resolves
    renderView()
    fireEvent.change(screen.getByRole('textbox', { name: 'topic' }), { target: { value: 'mcp' } })
    fireEvent.click(screen.getByRole('button', { name: /Get Prompt/ }))
    expect(screen.getByRole('button', { name: 'Getting…' })).toBeDisabled()
  })

  it('renders the latest get result, defaulting to the Preview tab', () => {
    useServerStore.setState({
      promptHistory: { [promptKey('srv', prompt.name)]: [successRecord()] }
    })
    renderView()
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByText('Summarize mcp')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' }).className).toContain('text-accent')
  })

  it('shows an empty history message when there are no gets', () => {
    renderView()
    expect(screen.getByText('No gets yet.')).toBeInTheDocument()
  })

  it('hides the result panel until a get has happened', () => {
    renderView()
    expect(screen.queryByText('Response')).not.toBeInTheDocument()
  })

  it('pre-fills the form when a history entry is clicked', () => {
    useServerStore.setState({
      promptHistory: {
        [promptKey('srv', prompt.name)]: [successRecord({ args: { topic: 'history' } })]
      }
    })
    renderView()
    // History entries summarize their args; clicking one re-fills the form.
    fireEvent.click(screen.getByText('{"topic":"history"}'))
    expect(screen.getByRole('textbox', { name: 'topic' })).toHaveValue('history')
  })

  it('clears the get history when clear is clicked', () => {
    useServerStore.setState({
      promptHistory: { [promptKey('srv', prompt.name)]: [successRecord()] }
    })
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByText('No gets yet.')).toBeInTheDocument()
  })
})
