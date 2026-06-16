import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CopyButton } from './CopyButton'

describe('CopyButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('writes the given text to the clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    render(<CopyButton text='{"a":1}' />)
    fireEvent.click(screen.getByRole('button'))

    expect(writeText).toHaveBeenCalledWith('{"a":1}')
  })

  it('shows a "Copied" state after a successful copy', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })

    render(<CopyButton text="x" />)
    expect(screen.getByText('Copy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument())
  })

  it('stays on "Copy" when the clipboard write rejects', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    })

    render(<CopyButton text="x" />)
    fireEvent.click(screen.getByRole('button'))

    // The rejection is swallowed; the label never flips to "Copied".
    await Promise.resolve()
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })
})
