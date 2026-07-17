import { create } from 'zustand'
import type { UpdateStatus } from '../../shared/updater.types'

interface UpdaterStore {
  status: UpdateStatus | null
  hydrate: () => () => void
  check: () => Promise<void>
  install: () => Promise<void>
}

export const useUpdaterStore = create<UpdaterStore>((set) => ({
  status: null,

  hydrate: () => {
    const unsubscribe = window.api.updater.onUpdateEvent((status) => set({ status }))
    void window.api.updater.getStatus().then((status) => set({ status }))
    return unsubscribe
  },

  check: async () => {
    set({ status: await window.api.updater.check() })
  },

  install: () => window.api.updater.install()
}))
