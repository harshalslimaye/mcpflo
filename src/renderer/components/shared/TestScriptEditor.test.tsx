import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TestScriptEditor } from './TestScriptEditor'

// CodeMirror's syntax highlighting splits a line's text across several
// sibling `<span>`s, so `screen.getByText(...)` (which matches within a single
// element) can't find it — read the editor's plain text content directly.
function editorText(): string | null {
  return document.querySelector('.cm-content')?.textContent ?? null
}

describe('TestScriptEditor', () => {
  it('renders the given script content', () => {
    render(<TestScriptEditor value='test("a", function () {})' onChange={() => {}} />)
    expect(editorText()).toBe('test("a", function () {})')
  })

  it('reports edits via onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TestScriptEditor value="" onChange={onChange} />)
    const editable = document.querySelector('.cm-content') as HTMLElement
    editable.focus()
    await user.type(editable, 'x')
    // CodeMirror's onChange passes (value, viewUpdate) — only the value is
    // part of this component's own contract.
    expect(onChange.mock.calls[0]?.[0]).toBe('x')
  })
})
