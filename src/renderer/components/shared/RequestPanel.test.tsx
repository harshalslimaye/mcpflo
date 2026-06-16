import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RequestPanel } from './RequestPanel'

type Run = Parameters<typeof RequestPanel>[0]['run']

function run(over: Partial<Run> = {}): Run {
  return {
    label: 'Run',
    busyLabel: 'Running…',
    busy: false,
    disabled: false,
    onRun: vi.fn(),
    ...over
  }
}

describe('RequestPanel', () => {
  it('renders the status hint, run label and header-end content', () => {
    render(
      <RequestPanel statusHint="Ready" run={run()} headerEnd={<span>tabs-here</span>}>
        body
      </RequestPanel>
    )
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Run')).toBeInTheDocument()
    expect(screen.getByText('tabs-here')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('shows the busy label while running', () => {
    render(
      <RequestPanel statusHint="x" run={run({ busy: true })}>
        body
      </RequestPanel>
    )
    expect(screen.getByText('Running…')).toBeInTheDocument()
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
  })

  it('calls onRun when the button is clicked', () => {
    const onRun = vi.fn()
    render(
      <RequestPanel statusHint="x" run={run({ onRun })}>
        body
      </RequestPanel>
    )
    fireEvent.click(screen.getByText('Run'))
    expect(onRun).toHaveBeenCalledOnce()
  })

  it('does not call onRun when disabled', () => {
    const onRun = vi.fn()
    render(
      <RequestPanel statusHint="x" run={run({ disabled: true, onRun })}>
        body
      </RequestPanel>
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onRun).not.toHaveBeenCalled()
  })

  it('runs on ⌘/Ctrl+Enter, but not when disabled', () => {
    const onRun = vi.fn()
    const { rerender } = render(
      <RequestPanel statusHint="x" run={run({ onRun })}>
        <textarea aria-label="body input" />
      </RequestPanel>
    )
    fireEvent.keyDown(screen.getByLabelText('body input'), { key: 'Enter', metaKey: true })
    expect(onRun).toHaveBeenCalledOnce()

    rerender(
      <RequestPanel statusHint="x" run={run({ onRun, disabled: true })}>
        <textarea aria-label="body input" />
      </RequestPanel>
    )
    fireEvent.keyDown(screen.getByLabelText('body input'), { key: 'Enter', ctrlKey: true })
    expect(onRun).toHaveBeenCalledOnce() // still once — the disabled press is ignored
  })
})
