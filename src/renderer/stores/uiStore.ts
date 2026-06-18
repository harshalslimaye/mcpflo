import { create } from 'zustand'

const STORAGE_KEY = 'mcpflo-sidebar-collapsed'

function resolveInitialCollapsed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

interface UiStore {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarCollapsed: resolveInitialCollapsed(),

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed
      localStorage.setItem(STORAGE_KEY, String(next))
      return { sidebarCollapsed: next }
    })
}))
