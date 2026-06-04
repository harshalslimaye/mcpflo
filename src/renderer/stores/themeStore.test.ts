import { describe, it, expect, beforeEach, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
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

  it('resolves stored light theme from localStorage on init', async () => {
    localStorage.setItem('mcpflo-theme', 'light')
    const { useThemeStore } = await import('./themeStore')
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('resolves stored dark theme from localStorage on init', async () => {
    localStorage.setItem('mcpflo-theme', 'dark')
    const { useThemeStore } = await import('./themeStore')
    expect(useThemeStore.getState().theme).toBe('dark')
  })
})
