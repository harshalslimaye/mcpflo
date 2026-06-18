import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToolCallResultView, type ResultTab } from './ToolCallResultView'
import type { ToolCallRecord } from '../../stores/serverStore'

function rec(over: Partial<ToolCallRecord>): ToolCallRecord {
  return {
    id: 'r1',
    serverId: 'srv',
    toolName: 'echo',
    args: {},
    status: 'success',
    notifications: [],
    durationMs: 10,
    at: Date.now(),
    ...over
  }
}

const envelope = {
  jsonrpc: '2.0',
  id: 4,
  result: { content: [{ type: 'text', text: 'Echo: HELLO' }] }
}

function view(record: ToolCallRecord, tab: ResultTab = 'pretty'): ReturnType<typeof render> {
  return render(<ToolCallResultView record={record} tab={tab} onTabChange={vi.fn()} />)
}

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('ToolCallResultView — status line', () => {
  it('shows success and duration', () => {
    view(rec({ response: envelope, durationMs: 42 }))
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByText('42 ms')).toBeInTheDocument()
  })

  it('shows a transport error message on the response tabs', () => {
    view(rec({ status: 'error', error: 'connection refused' }))
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('connection refused')).toBeInTheDocument()
    // Tabs stay visible — a failed call can still have received notifications.
    expect(screen.getByRole('button', { name: 'Raw' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('marks a JSON-RPC error envelope as an error but still shows the tabs', () => {
    view(
      rec({
        status: 'error',
        response: { jsonrpc: '2.0', id: 4, error: { code: -32601, message: 'Method not found' } }
      })
    )
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raw' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pretty' })).toBeInTheDocument()
  })

  it('shows an error icon next to the status line on errors, and none on success', () => {
    const { unmount } = view(rec({ status: 'error', error: 'boom' }))
    expect(screen.getByLabelText('Error icon')).toBeInTheDocument()
    unmount()
    view(rec({ response: envelope }))
    expect(screen.queryByLabelText('Error icon')).not.toBeInTheDocument()
  })
})

describe('ToolCallResultView — Raw tab', () => {
  it('shows the entire envelope as compact JSON', () => {
    const { container } = view(rec({ response: envelope }), 'raw')
    expect(container.textContent).toContain('"jsonrpc":"2.0"')
    expect(container.textContent).toContain('"text":"Echo: HELLO"')
  })

  it('copies the compact JSON to the clipboard', () => {
    view(rec({ response: envelope }), 'raw')
    fireEvent.click(screen.getByRole('button', { name: /copy json/i }))
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(envelope))
  })
})

describe('ToolCallResultView — Pretty tab', () => {
  it('shows the entire envelope indented', () => {
    const { container } = view(rec({ response: envelope }), 'pretty')
    expect(container.textContent).toContain('"jsonrpc": "2.0"')
    expect(container.textContent).toContain('"result"')
    expect(container.textContent).toContain('Echo: HELLO')
  })

  it('copies the pretty JSON to the clipboard', () => {
    view(rec({ response: envelope }), 'pretty')
    fireEvent.click(screen.getByRole('button', { name: /copy json/i }))
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(envelope, null, 2))
  })

  it('highlights booleans and null in the pretty output', () => {
    const { container } = view(
      rec({
        response: { jsonrpc: '2.0', id: 1, result: { ok: true, missing: null } }
      }),
      'pretty'
    )
    expect(container.querySelector('pre .text-purple-600')?.textContent).toBe('true')
    expect(container.querySelector('pre .text-text-muted')?.textContent).toBe('null')
  })
})

describe('ToolCallResultView — copy button states', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows Copied after a successful copy and reverts after 1.5s', async () => {
    vi.useFakeTimers()
    view(rec({ response: envelope }), 'pretty')
    fireEvent.click(screen.getByRole('button', { name: /copy json/i }))
    // Flush the clipboard promise resolution.
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Copied')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('stays on Copy when the clipboard write is rejected', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    view(rec({ response: envelope }), 'pretty')
    fireEvent.click(screen.getByRole('button', { name: /copy json/i }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Copy')).toBeInTheDocument()
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()
  })
})

describe('ToolCallResultView — Preview tab', () => {
  it('renders content blocks human-readably instead of the envelope', () => {
    view(rec({ response: envelope }), 'preview')
    expect(screen.getByText('Echo: HELLO')).toBeInTheDocument()
    expect(screen.getByText('text')).toBeInTheDocument()
    // The raw envelope keys are not shown on Preview.
    expect(screen.queryByText(/jsonrpc/)).not.toBeInTheDocument()
  })

  it('shows the protocol error when the envelope is a JSON-RPC error', () => {
    const { container } = view(
      rec({
        status: 'error',
        response: { jsonrpc: '2.0', id: 4, error: { code: -32601, message: 'Method not found' } }
      }),
      'preview'
    )
    expect(container.textContent).toContain('Method not found')
  })

  it('offers a Preview tab alongside Raw and Pretty', () => {
    view(rec({ response: envelope }))
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raw' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pretty' })).toBeInTheDocument()
  })

  it('falls back to the whole response when the envelope has a non-object result', () => {
    const { container } = view(
      rec({ response: { jsonrpc: '2.0', id: 1, result: 'just a string' } }),
      'preview'
    )
    expect(container.textContent).toContain('just a string')
    expect(container.textContent).toContain('jsonrpc')
  })

  it('does not show a copy button on the Preview tab', () => {
    view(rec({ response: envelope }), 'preview')
    expect(screen.queryByRole('button', { name: /copy json/i })).not.toBeInTheDocument()
  })

  it('renders an isError result with error styling and its content blocks', () => {
    const { container } = view(
      rec({
        status: 'error',
        response: {
          jsonrpc: '2.0',
          id: 1,
          result: { isError: true, content: [{ type: 'text', text: 'Division by zero' }] }
        }
      }),
      'preview'
    )
    expect(screen.getByText('Division by zero')).toBeInTheDocument()
    expect(container.querySelector('.border-red-500\\/40')).not.toBeNull()
    expect(screen.getByLabelText('Error icon')).toBeInTheDocument()
  })
})

describe('ToolCallResultView — truncated response', () => {
  it('shows the size-limit notice instead of attempting to render the dropped payload', () => {
    view(rec({ responseTruncated: true, response: undefined }), 'pretty')
    expect(screen.getByText(/exceeded the in-memory size limit/i)).toBeInTheDocument()
    // Not mistaken for a transport failure.
    expect(screen.queryByText('No response received.')).not.toBeInTheDocument()
  })
})

describe('ToolCallResultView — tab switching', () => {
  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn()
    render(
      <ToolCallResultView
        record={rec({ response: envelope })}
        tab="pretty"
        onTabChange={onTabChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    expect(onTabChange).toHaveBeenCalledWith('raw')
  })
})

describe('ToolCallResultView — executing state', () => {
  const liveProgress = {
    method: 'notifications/progress',
    params: { progress: 2, total: 5 },
    at: 1700000000000
  }

  function running(
    tab: ResultTab = 'preview',
    liveNotifications = [liveProgress]
  ): ReturnType<typeof render> {
    return render(
      <ToolCallResultView
        tab={tab}
        onTabChange={vi.fn()}
        busy
        liveNotifications={liveNotifications}
      />
    )
  }

  it('shows an executing status line instead of Success/Error and duration', () => {
    running()
    expect(screen.getAllByText('Executing…').length).toBeGreaterThan(0)
    expect(screen.queryByText('Success')).not.toBeInTheDocument()
    expect(screen.queryByText('Error')).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+ ms/)).not.toBeInTheDocument()
  })

  it('keeps all tabs visible while running', () => {
    running()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raw' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pretty' })).toBeInTheDocument()
  })

  it('shows an executing placeholder on the response tabs', () => {
    running('pretty')
    expect(screen.queryByRole('button', { name: /copy json/i })).not.toBeInTheDocument()
    // Status line + body placeholder.
    expect(screen.getAllByText('Executing…')).toHaveLength(2)
  })

  it('counts live notifications in the tab label as they arrive', () => {
    const { rerender } = running()
    expect(screen.getByRole('button', { name: 'Notifications (1)' })).toBeInTheDocument()
    rerender(
      <ToolCallResultView
        tab="preview"
        onTabChange={vi.fn()}
        busy
        liveNotifications={[liveProgress, liveProgress]}
      />
    )
    expect(screen.getByRole('button', { name: 'Notifications (2)' })).toBeInTheDocument()
  })

  it('renders live notifications on the Notifications tab while running', () => {
    running('notifications')
    expect(screen.getByText('progress')).toBeInTheDocument()
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })

  it('shows the present-tense empty state when no notifications arrived yet', () => {
    running('notifications', [])
    expect(screen.getByText(/No notifications received yet/)).toBeInTheDocument()
  })
})

describe('ToolCallResultView — Notifications tab', () => {
  const progressNotification = {
    method: 'notifications/progress',
    params: { progress: 2, total: 5 },
    at: 1700000000000
  }

  it('is always present, unlabelled with a count when there are none', () => {
    view(rec({ response: envelope }))
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('shows the count in the label when notifications were received', () => {
    view(rec({ response: envelope, notifications: [progressNotification] }))
    expect(screen.getByRole('button', { name: 'Notifications (1)' })).toBeInTheDocument()
  })

  it('shows the teaching empty state on the tab when none were received', () => {
    view(rec({ response: envelope }), 'notifications')
    expect(screen.getByText(/No notifications were received during this call/)).toBeInTheDocument()
  })

  it('renders the received notifications when the tab is active', () => {
    view(rec({ response: envelope, notifications: [progressNotification] }), 'notifications')
    expect(screen.getByText('progress')).toBeInTheDocument()
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })

  it('reports tab selection through onTabChange', () => {
    const onTabChange = vi.fn()
    render(
      <ToolCallResultView
        record={rec({ response: envelope })}
        tab="preview"
        onTabChange={onTabChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(onTabChange).toHaveBeenCalledWith('notifications')
  })
})
