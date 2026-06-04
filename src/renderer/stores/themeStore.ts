import { create } from 'zustand'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'mcpflo-theme'

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

function resolveInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
}

interface ThemeStore {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: resolveInitialTheme(),

  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem(STORAGE_KEY, next)
      applyTheme(next)
      return { theme: next }
    }),

  setTheme: (theme: Theme) =>
    set(() => {
      localStorage.setItem(STORAGE_KEY, theme)
      applyTheme(theme)
      return { theme }
    })
}))
