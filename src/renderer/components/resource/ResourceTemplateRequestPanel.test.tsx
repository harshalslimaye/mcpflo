import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResourceTemplateRequestPanel } from './ResourceTemplateRequestPanel'
import type { ResourceTemplate } from '../../../shared/mcp.types'

// Only the completion describe block reaches this — everywhere else the panel
// renders with completionsSupported defaulted to false.
vi.mock('../../lib/completion', () => ({
  requestCompletion: vi.fn(),
  COMPLETION_DEBOUNCE_MS: 20
}))
import { requestCompletion } from '../../lib/completion'

const oneVar: ResourceTemplate = { uriTemplate: 'mem://text/{id}' }
const twoVars: ResourceTemplate = { uriTemplate: 'repo://{owner}/{repo}/tree' }
const noVars: ResourceTemplate = { uriTemplate: 'mem://static' }

const mockOnExecute = vi.fn()
const mockOnTabChange = vi.fn()

function renderPanel(
  template: ResourceTemplate,
  props: Partial<React.ComponentProps<typeof ResourceTemplateRequestPanel>> = {}
): ReturnType<typeof render> {
  return render(
    <ResourceTemplateRequestPanel
      template={template}
      serverId="memory-mcp"
      activeTab="params"
      onTabChange={mockOnTabChange}
      running={false}
      onExecute={mockOnExecute}
      {...props}
    />
  )
}

const previewText = (): string | null => screen.getByTestId('expanded-uri').textContent

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ResourceTemplateRequestPanel — form rendering', () => {
  it('renders a text input per template variable', () => {
    renderPanel(twoVars)
    expect(screen.getByRole('textbox', { name: 'owner' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'repo' })).toBeInTheDocument()
  })

  it('marks every variable required', () => {
    renderPanel(twoVars)
    expect(screen.getAllByText('*')).toHaveLength(2)
  })

  it('shows a no-variables message for an already-concrete template', () => {
    renderPanel(noVars)
    expect(screen.getByText('This template has no variables.')).toBeInTheDocument()
  })

  it('offers only the Params and Schema tabs', () => {
    renderPanel(oneVar)
    expect(screen.getByRole('button', { name: 'Params' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schema' })).toBeInTheDocument()
    for (const absent of ['Saved', 'Tokens', 'Tests']) {
      expect(screen.queryByRole('button', { name: absent })).not.toBeInTheDocument()
    }
  })
})

describe('ResourceTemplateRequestPanel — expanded uri preview', () => {
  it('shows the template itself before anything is filled in', () => {
    renderPanel(oneVar)
    expect(previewText()).toBe('mem://text/{id}')
  })

  it('explains what is still missing', () => {
    renderPanel(twoVars)
    expect(screen.getByText(/Missing values for owner, repo/)).toBeInTheDocument()
  })

  it('updates as a value is typed', () => {
    renderPanel(oneVar)
    fireEvent.change(screen.getByRole('textbox', { name: 'id' }), { target: { value: '7' } })
    expect(previewText()).toBe('mem://text/7')
  })

  it('shows the encoding a value picks up, before the read rather than after', () => {
    renderPanel(oneVar)
    fireEvent.change(screen.getByRole('textbox', { name: 'id' }), { target: { value: 'a/b' } })
    expect(previewText()).toBe('mem://text/a%2Fb')
  })

  it('falls back to the template again when a value is cleared', () => {
    renderPanel(oneVar)
    const input = screen.getByRole('textbox', { name: 'id' })
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.change(input, { target: { value: '' } })
    expect(previewText()).toBe('mem://text/{id}')
  })

  it('previews a template that needs no filling in as-is', () => {
    renderPanel(noVars)
    expect(previewText()).toBe('mem://static')
  })
})

describe('ResourceTemplateRequestPanel — validation and read', () => {
  const readButton = (): HTMLElement => screen.getByRole('button', { name: /Read/ })

  it('disables Read while a variable is empty', () => {
    renderPanel(oneVar)
    expect(readButton()).toBeDisabled()
  })

  it('enables Read once every variable has a value', () => {
    renderPanel(oneVar)
    fireEvent.change(screen.getByRole('textbox', { name: 'id' }), { target: { value: '7' } })
    expect(readButton()).toBeEnabled()
  })

  it('keeps Read disabled for a whitespace-only value', () => {
    // `required` in JSON Schema only asks whether the key is present, so this
    // passes form validation while the expansion still refuses it.
    renderPanel(oneVar)
    fireEvent.change(screen.getByRole('textbox', { name: 'id' }), { target: { value: '   ' } })
    expect(readButton()).toBeDisabled()
  })

  it('enables Read immediately for a template with no variables', () => {
    renderPanel(noVars)
    expect(readButton()).toBeEnabled()
  })

  it('passes the values, not the expanded uri — the store expands again', () => {
    renderPanel(oneVar)
    fireEvent.change(screen.getByRole('textbox', { name: 'id' }), { target: { value: '7' } })
    fireEvent.click(readButton())
    expect(mockOnExecute).toHaveBeenCalledWith({ id: '7' })
  })

  it('disables Read while a read is already running', () => {
    renderPanel(noVars, { running: true })
    expect(readButton()).toBeDisabled()
  })
})

describe('ResourceTemplateRequestPanel — raw JSON mode', () => {
  it('drives the same preview as the form', () => {
    renderPanel(oneVar)
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{"id":"9"}' }
    })
    expect(previewText()).toBe('mem://text/9')
  })

  it('reports invalid JSON and keeps Read disabled', () => {
    renderPanel(oneVar)
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{nope' }
    })
    expect(screen.getByRole('button', { name: /Read/ })).toBeDisabled()
  })

  it('coerces a non-string value rather than sending it raw', () => {
    renderPanel(oneVar)
    fireEvent.click(screen.getByRole('switch', { name: 'Edit as raw JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Params JSON' }), {
      target: { value: '{"id":42}' }
    })
    expect(previewText()).toBe('mem://text/42')
    fireEvent.click(screen.getByRole('button', { name: /Read/ }))
    expect(mockOnExecute).toHaveBeenCalledWith({ id: '42' })
  })
})

describe('ResourceTemplateRequestPanel — completion', () => {
  it('renders plain inputs when the server declares no completions support', () => {
    renderPanel(twoVars)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(requestCompletion).not.toHaveBeenCalled()
  })

  it('renders comboboxes when completions are supported', () => {
    renderPanel(twoVars, { completionsSupported: true })
    expect(screen.getByRole('combobox', { name: 'owner' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'repo' })).toBeInTheDocument()
  })

  it('completes against the raw template, not a uri it expanded to', async () => {
    vi.mocked(requestCompletion).mockResolvedValue({ values: ['hello-world'] })
    renderPanel(twoVars, { completionsSupported: true })

    fireEvent.change(screen.getByRole('combobox', { name: 'owner' }), {
      target: { value: 'octocat' }
    })
    fireEvent.focus(screen.getByRole('combobox', { name: 'repo' }))

    await waitFor(() => expect(requestCompletion).toHaveBeenCalled())
    const call = vi.mocked(requestCompletion).mock.calls[0][0]
    expect(call.ref).toEqual({ type: 'ref/resource', uri: 'repo://{owner}/{repo}/tree' })
    expect(call.argName).toBe('repo')
    expect(call.contextArgs).toEqual({ owner: 'octocat' })
  })
})

describe('ResourceTemplateRequestPanel — prefill', () => {
  it('fills the form from a past read and previews it', () => {
    const { rerender } = renderPanel(oneVar)
    rerender(
      <ResourceTemplateRequestPanel
        template={oneVar}
        serverId="memory-mcp"
        activeTab="params"
        onTabChange={mockOnTabChange}
        running={false}
        onExecute={mockOnExecute}
        prefill={{ args: { id: '42' }, nonce: 1 }}
      />
    )
    expect(screen.getByRole('textbox', { name: 'id' })).toHaveValue('42')
    expect(previewText()).toBe('mem://text/42')
    expect(mockOnExecute).not.toHaveBeenCalled()
  })
})
