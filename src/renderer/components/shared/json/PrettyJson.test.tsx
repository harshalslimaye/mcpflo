import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PrettyJson } from './PrettyJson'

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('PrettyJson', () => {
  it('renders an object as an interactive tree (no <pre>)', () => {
    const { container } = render(<PrettyJson value={{ jsonrpc: '2.0', id: 1 }} />)
    expect(container.textContent).toContain('jsonrpc')
    expect(container.textContent).toContain('2.0')
    expect(container.querySelector('pre')).toBeNull()
  })

  it('expands an embedded JSON string into nested nodes', () => {
    const { container } = render(<PrettyJson value={{ text: '{"city":"Paris"}' }} />)
    expect(container.textContent).toContain('city')
    expect(container.textContent).toContain('Paris')
    expect(container.textContent).not.toContain('\\"city\\"')
  })

  it('copies the expanded, indented JSON', () => {
    render(<PrettyJson value={{ text: '{"a":1}' }} />)
    fireEvent.click(screen.getByRole('button', { name: /copy json/i }))
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ text: { a: 1 } }, null, 2))
  })

  it('falls back to a flat <pre> for oversized payloads', () => {
    // A payload whose serialized form exceeds the tree size limit (256 KB).
    const big = { blob: 'x'.repeat(300 * 1024) }
    const { container } = render(<PrettyJson value={big} />)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain('blob')
  })
})
