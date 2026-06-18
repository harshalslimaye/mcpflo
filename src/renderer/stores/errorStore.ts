import { create } from 'zustand'

// A transient, app-level error shown to the user as a toast. These are MCPFlo's
// *own* failures (a failed IPC call, a store write that threw, a hydrate that
// couldn't read the cache) — distinct from server-protocol errors, which surface
// in the result panels via history records.
export interface ErrorToast {
  id: string
  message: string
}

// How long a toast stays up before auto-dismissing.
const TOAST_TTL_MS = 6000

interface ErrorStore {
  toasts: ErrorToast[]
  pushError: (message: string) => void
  dismiss: (id: string) => void
}

// Normalises anything thrown into a displayable string. Exposed so callers can
// `pushError(toMessage(err))` without re-implementing the unwrap each time.
export function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export const useErrorStore = create<ErrorStore>((set) => ({
  toasts: [],

  pushError: (message) => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, message }] }))
    // Auto-expire so the stack self-clears; the user can also dismiss manually.
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, TOAST_TTL_MS)
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))
