import { randomUUID } from 'node:crypto'
import type { ElicitationResult } from '../shared/mcp.types'

// Bridges the async gap between a server's elicitation/create request (held
// open as a promise in the mcp:callTool handler) and the user's answer
// arriving later over mcp:respondToElicitation. Kept free of Electron imports
// so it stays unit-testable.

interface PendingElicitation {
  callId: string
  resolve: (result: ElicitationResult) => void
}

const pending = new Map<string, PendingElicitation>()

export function createPending(callId: string): {
  elicitationId: string
  promise: Promise<ElicitationResult>
} {
  const elicitationId = randomUUID()
  const promise = new Promise<ElicitationResult>((resolve) => {
    pending.set(elicitationId, { callId, resolve })
  })
  return { elicitationId, promise }
}

// Settles a pending elicitation. Returns false when the id is unknown or
// already settled — every settle path deletes before resolving, so races
// (user answers just as the server aborts) collapse to a no-op.
export function resolvePending(elicitationId: string, result: ElicitationResult): boolean {
  const entry = pending.get(elicitationId)
  if (!entry) return false
  pending.delete(elicitationId)
  entry.resolve(result)
  return true
}

// Cancels every elicitation still pending for a tool call (used when the call
// settles or the transport dies). Returns the ids so callers can notify the
// renderer to close the corresponding modals.
export function cancelPendingForCall(callId: string): string[] {
  const cancelled: string[] = []
  for (const [id, entry] of pending) {
    if (entry.callId !== callId) continue
    pending.delete(id)
    entry.resolve({ action: 'cancel' })
    cancelled.push(id)
  }
  return cancelled
}
