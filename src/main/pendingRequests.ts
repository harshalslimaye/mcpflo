import { randomUUID } from 'node:crypto'

// Bridges the async gap between a server-initiated request (held open as a
// promise in the mcp:callTool handler) and the user's answer arriving later
// over IPC. Each kind of request — elicitation, sampling — gets its own
// registry from `createPendingRegistry`, so cancellation reports only that
// kind's ids and the IPC layer knows which channel to close. Kept free of
// Electron imports so it stays unit-testable.

export interface PendingRegistry<T> {
  // Registers a pending request for `callId` and returns its id plus a promise
  // that settles when the request is resolved or cancelled.
  createPending(callId: string): { requestId: string; promise: Promise<T> }
  // Settles a pending request. Returns false when the id is unknown or already
  // settled — every settle path deletes before resolving, so races (user
  // answers just as the server aborts) collapse to a no-op.
  resolvePending(requestId: string, result: T): boolean
  // Cancels every request still pending for a call (used when the call settles
  // or the transport dies). Returns the ids so callers can notify the renderer
  // to close the corresponding modals.
  cancelPendingForCall(callId: string): string[]
}

export function createPendingRegistry<T>(cancelValue: T): PendingRegistry<T> {
  interface Entry {
    callId: string
    resolve: (result: T) => void
  }
  const pending = new Map<string, Entry>()

  return {
    createPending(callId) {
      const requestId = randomUUID()
      const promise = new Promise<T>((resolve) => {
        pending.set(requestId, { callId, resolve })
      })
      return { requestId, promise }
    },

    resolvePending(requestId, result) {
      const entry = pending.get(requestId)
      if (!entry) return false
      pending.delete(requestId)
      entry.resolve(result)
      return true
    },

    cancelPendingForCall(callId) {
      const cancelled: string[] = []
      for (const [id, entry] of pending) {
        if (entry.callId !== callId) continue
        pending.delete(id)
        entry.resolve(cancelValue)
        cancelled.push(id)
      }
      return cancelled
    }
  }
}
