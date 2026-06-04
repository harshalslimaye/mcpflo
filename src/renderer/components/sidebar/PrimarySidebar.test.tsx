import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PrimarySidebar } from './PrimarySidebar'
import { useThemeStore } from '../../stores/themeStore'

const mockToggleTheme = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

function renderSidebar(theme: 'dark' | 'light' = 'dark') {
  useThemeStore.setState({ theme, toggleTheme: mockToggleTheme })
  return render(<PrimarySidebar />)
}

describe('PrimarySidebar', () => {
  it('renders MCP Servers button', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'MCP Servers' })).toBeInTheDocument()
  })

  it('renders Workflows button', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument()
  })

  it('renders Settings button', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders Toggle Theme button', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'Toggle Theme' })).toBeInTheDocument()
  })

  it('wraps each button in a Tooltip', () => {
    const { container } = renderSidebar()
    // Each button should be a direct child of a Tooltip (no extra wrapper divs)
    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(4)
  })

  it('shows Sun icon in dark theme', () => {
    renderSidebar('dark')
    const btn = screen.getByRole('button', { name: 'Toggle Theme' })
    expect(btn.querySelector('svg')).toBeInTheDocument()
  })

  it('shows Moon icon in light theme', () => {
    renderSidebar('light')
    const btn = screen.getByRole('button', { name: 'Toggle Theme' })
    expect(btn.querySelector('svg')).toBeInTheDocument()
  })

  it('calls toggleTheme when theme toggle is clicked', () => {
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Theme' }))
    expect(mockToggleTheme).toHaveBeenCalledOnce()
  })

  it('renders no visible text labels', () => {
    const { container } = renderSidebar()
    const buttons = container.querySelectorAll('button')
    buttons.forEach((btn) => {
      expect(btn.textContent?.trim()).toBe('')
    })
  })

  it('has 4 icon buttons total', () => {
    const { container } = renderSidebar()
    expect(container.querySelectorAll('button')).toHaveLength(4)
  })
})
