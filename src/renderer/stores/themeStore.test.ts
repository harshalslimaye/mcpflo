import { describe, it, expect, beforeEach } from 'vitest'

// Reset module + localStorage between tests
beforeEach(() => {
  localStorage.clear()
  // Re-import a fresh store instance
})

describe('themeStore', () => {
  it('defaults to dark when localStorage is empty', async () => {
    const { useThemeStore } = await import('./themeStore')
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('toggleTheme switches dark → light', async () => {
    const { useThemeStore } = await import('./themeStore')
    useThemeStore.getState().setTheme('dark')
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('toggleTheme switches light → dark', async () => {
    const { useThemeStore } = await import('./themeStore')
    useThemeStore.getState().setTheme('light')
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('setTheme persists to localStorage', async () => {
    const { useThemeStore } = await import('./themeStore')
    useThemeStore.getState().setTheme('light')
    expect(localStorage.getItem('mcpflo-theme')).toBe('light')
  })

  it('toggleTheme persists to localStorage', async () => {
    const { useThemeStore } = await import('./themeStore')
    useThemeStore.getState().setTheme('dark')
    useThemeStore.getState().toggleTheme()
    expect(localStorage.getItem('mcpflo-theme')).toBe('light')
  })

  it('setTheme applies data-theme attribute to documentElement', async () => {
    const { useThemeStore } = await import('./themeStore')
    useThemeStore.getState().setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    useThemeStore.getState().setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
