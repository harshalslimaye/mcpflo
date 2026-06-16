import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { highlightJson } from './highlightJson'

// Render the returned nodes into a container so we can assert on the token spans.
function highlight(json: string): HTMLElement {
  const { container } = render(<>{highlightJson(json)}</>)
  return container
}

describe('highlightJson', () => {
  it('classes object keys and string values differently', () => {
    const c = highlight('{"name":"value"}')
    expect(c.querySelector('.text-sky-600')?.textContent).toBe('"name":')
    expect(c.querySelector('.text-emerald-600')?.textContent).toBe('"value"')
  })

  it('classes booleans, null and numbers', () => {
    expect(highlight('true').querySelector('.text-purple-600')?.textContent).toBe('true')
    expect(highlight('null').querySelector('.text-text-muted')?.textContent).toBe('null')
    expect(highlight('-12.5').querySelector('.text-amber-600')?.textContent).toBe('-12.5')
  })

  it('emits unmatched structural characters as plain text, losing nothing', () => {
    const c = highlight('{"a":1}')
    expect(c.textContent).toBe('{"a":1}')
  })
})
