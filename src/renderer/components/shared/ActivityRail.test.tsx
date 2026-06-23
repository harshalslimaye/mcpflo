import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityRail } from './ActivityRail'
import {
  useServerStore,
  toolKey,
  type ToolCallRecord,
  type PromptGetRecord
} from '../../stores/serverStore'
import type { ProtocolEvent } from '../../lib/activityEvent'

function toolRec(over: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: 't1',
    serverId: 's1',
    toolName: 'echo',
    args: { message: 'hi' },
    status: 'success',
    notifications: [],
    durationMs: 5,
    at: 1000,
    ...over
  }
}

const connectEvent: ProtocolEvent = {
  id: 'c1',
  kind: 'connect',
  serverId: 's1',
  serverName: 'Demo',
  status: 'success',
  detail: 'initialized',
  source: 'live',
  durationMs: 12,
  at: 5000
}

const cachedListEvent: ProtocolEvent = {
  id: 'lc1',
  kind: 'list-tools',
  serverId: 's1',
  serverName: 'Demo',
  status: 'success',
  detail: '3 tools',
  source: 'cache',
  durationMs: 0,
  at: 4000
}

beforeEach(() => {
  useServerStore.setState({
    history: {},
    resourceHistory: {},
    promptHistory: {},
    protocolEvents: [],
    selectedTool: null,
    selectedResource: null,
    selectedPrompt: null
  })
})

const thisProps = {
  thisTabLabel: 'This tool',
  emptyLabel: 'No calls yet.',
  onClearThis: vi.fn()
}

describe('ActivityRail', () => {
  it('defaults to the All tab and offers both tab controls', () => {
    render(<ActivityRail<PromptGetRecord> thisRecords={[]} {...thisProps} />)
    expect(screen.getByText('No activity yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This tool' })).toBeInTheDocument()
  })

  it('switches to the entity tab and shows its empty copy', () => {
    render(<ActivityRail<ToolCallRecord> thisRecords={[]} {...thisProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'This tool' }))
    expect(screen.getByText('No calls yet.')).toBeInTheDocument()
  })

  it('shows merged activity from every source on the All tab', () => {
    useServerStore.setState({
      history: { [toolKey('s1', 'echo')]: [toolRec()] },
      protocolEvents: [connectEvent]
    })
    render(<ActivityRail<ToolCallRecord> thisRecords={[]} {...thisProps} />)
    // A tool call row and the protocol (connect) row both appear on the default
    // All tab.
    expect(screen.getByText('echo')).toBeInTheDocument()
    expect(screen.getByText('initialize')).toBeInTheDocument()
    expect(screen.getByText('Demo')).toBeInTheDocument()
  })

  it('badges a cache-sourced protocol row as cached', () => {
    useServerStore.setState({ protocolEvents: [cachedListEvent] })
    render(<ActivityRail<ToolCallRecord> thisRecords={[]} {...thisProps} />)
    expect(screen.getByText('cached')).toBeInTheDocument()
  })

  it('navigates to a tool when its All-tab row is clicked', () => {
    useServerStore.setState({ history: { [toolKey('s1', 'echo')]: [toolRec()] } })
    render(<ActivityRail<ToolCallRecord> thisRecords={[]} {...thisProps} />)
    fireEvent.click(screen.getByText('echo'))
    expect(useServerStore.getState().selectedTool).toEqual({ serverId: 's1', toolName: 'echo' })
  })

  it('renders protocol rows as read-only (no navigation control)', () => {
    useServerStore.setState({ protocolEvents: [connectEvent] })
    render(<ActivityRail<ToolCallRecord> thisRecords={[]} {...thisProps} />)
    // The connect row is plain text, not a button.
    expect(screen.queryByRole('button', { name: /initialize/ })).toBeNull()
  })

  it('clears all activity from the All tab', () => {
    useServerStore.setState({
      history: { [toolKey('s1', 'echo')]: [toolRec()] },
      protocolEvents: [connectEvent]
    })
    render(<ActivityRail<ToolCallRecord> thisRecords={[]} {...thisProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(useServerStore.getState().history).toEqual({})
    expect(useServerStore.getState().protocolEvents).toEqual([])
  })

  it('clears only this entity from the entity tab', () => {
    const onClearThis = vi.fn()
    render(
      <ActivityRail<ToolCallRecord>
        thisRecords={[toolRec()]}
        thisTabLabel="This tool"
        emptyLabel="No calls yet."
        onClearThis={onClearThis}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'This tool' }))
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(onClearThis).toHaveBeenCalledOnce()
  })
})
