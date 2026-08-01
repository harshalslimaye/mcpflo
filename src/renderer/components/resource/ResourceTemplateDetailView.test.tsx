import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResourceTemplateDetailView } from './ResourceTemplateDetailView'
import { useServerStore, resourceKey, type ResourceReadRecord } from '../../stores/serverStore'
import type { ResourceTemplate } from '../../../shared/mcp.types'

const template: ResourceTemplate = {
  uriTemplate: 'demo://note/{id}',
  name: 'Note',
  description: 'A note by id',
  mimeType: 'text/markdown'
}

const key = resourceKey('srv', template.uriTemplate)
const mockReadResourceTemplate = vi.fn()
const mockClearResourceHistory = vi.fn()

function renderView(t: ResourceTemplate = template): ReturnType<typeof render> {
  return render(<ResourceTemplateDetailView template={t} serverId="srv" serverName="Everything" />)
}

function record(over: Partial<ResourceReadRecord> = {}): ResourceReadRecord {
  return {
    id: '1',
    serverId: 'srv',
    uri: template.uriTemplate,
    expandedUri: 'demo://note/7',
    args: { id: '7' },
    status: 'success',
    response: {
      jsonrpc: '2.0',
      result: { contents: [{ uri: 'demo://note/7', mimeType: 'text/markdown', text: '# Seven' }] }
    },
    durationMs: 8,
    at: Date.now(),
    ...over
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockReadResourceTemplate.mockResolvedValue(undefined)
  useServerStore.setState({
    servers: [],
    resourceHistory: {},
    readResourceTemplate: mockReadResourceTemplate,
    clearResourceHistory: mockClearResourceHistory
  })
})

describe('ResourceTemplateDetailView', () => {
  it('renders the header with name, template, server and mimeType', () => {
    renderView()
    expect(screen.getByText('Note')).toBeInTheDocument()
    // Once as the header chip, once as the request panel's "will read" preview.
    expect(screen.getAllByText('demo://note/{id}')).toHaveLength(2)
    expect(screen.getByText('Everything')).toBeInTheDocument()
    expect(screen.getByText('text/markdown')).toBeInTheDocument()
  })

  it('reads with the template and the entered values, not an expanded uri', () => {
    renderView()
    fireEvent.change(screen.getByRole('textbox', { name: 'id' }), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(mockReadResourceTemplate).toHaveBeenCalledWith('srv', 'demo://note/{id}', { id: '7' })
  })

  it('shows a Reading… state while a read is in flight', () => {
    mockReadResourceTemplate.mockReturnValue(new Promise(() => {})) // never resolves
    renderView()
    fireEvent.change(screen.getByRole('textbox', { name: 'id' }), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(screen.getByRole('button', { name: 'Reading…' })).toBeDisabled()
  })

  it('renders the latest read result', () => {
    useServerStore.setState({ resourceHistory: { [key]: [record()] } })
    renderView()
    expect(screen.getByText('Success')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand response'))
    expect(screen.getByText('# Seven')).toBeInTheDocument()
  })

  it('labels each history row with the uri it actually read', () => {
    useServerStore.setState({
      resourceHistory: {
        [key]: [record({ id: 'a', expandedUri: 'demo://note/8', args: { id: '8' } }), record()]
      }
    })
    renderView()
    fireEvent.click(screen.getByRole('button', { name: /This template/ }))
    // Both rows share the template as their label, so the expanded uri is what
    // tells them apart.
    expect(screen.getByText('demo://note/8')).toBeInTheDocument()
    expect(screen.getByText('demo://note/7')).toBeInTheDocument()
  })

  it('re-fills the form from a history entry rather than only switching the view', () => {
    useServerStore.setState({
      resourceHistory: {
        [key]: [record({ id: 'a', expandedUri: 'demo://note/8', args: { id: '8' } })]
      }
    })
    renderView()
    fireEvent.click(screen.getByRole('button', { name: /This template/ }))
    fireEvent.click(screen.getByText('demo://note/8'))
    expect(screen.getByRole('textbox', { name: 'id' })).toHaveValue('8')
    // Prefill alone must not re-run the read.
    expect(mockReadResourceTemplate).not.toHaveBeenCalled()
  })

  it('clears this template’s history under the template key', () => {
    useServerStore.setState({ resourceHistory: { [key]: [record()] } })
    renderView()
    fireEvent.click(screen.getByRole('button', { name: /This template/ }))
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(mockClearResourceHistory).toHaveBeenCalledWith('srv', 'demo://note/{id}')
  })

  it('offers Read straight away for a template with no variables', () => {
    renderView({ uriTemplate: 'demo://static' })
    expect(screen.getByText('This template has no variables.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(mockReadResourceTemplate).toHaveBeenCalledWith('srv', 'demo://static', {})
  })

  it('enables the completion typeahead only when the server declares it', () => {
    useServerStore.setState({
      servers: [
        {
          id: 'srv',
          name: 'Everything',
          transport: { type: 'stdio', command: 'npx' },
          status: 'connected',
          tools: [],
          resources: [],
          resourceTemplates: [template],
          prompts: [],
          features: { completions: true }
        }
      ]
    })
    renderView()
    expect(screen.getByRole('combobox', { name: 'id' })).toBeInTheDocument()
  })
})
