import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomBar } from './BottomBar'
import { useThemeStore } from '../../stores/themeStore'

const mockToggleTheme = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

function renderBottomBar(theme: 'dark' | 'light' = 'dark'): ReturnType<typeof render> {
  useThemeStore.setState({ theme, toggleTheme: mockToggleTheme })
  return render(<BottomBar />)
}

describe('BottomBar', () => {
  it('renders only the Toggle Theme button', () => {
    const { container } = renderBottomBar()
    expect(screen.getByRole('button', { name: 'Toggle Theme' })).toBeInTheDocument()
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('shows Sun icon in dark theme', () => {
    renderBottomBar('dark')
    const btn = screen.getByRole('button', { name: 'Toggle Theme' })
    expect(btn.querySelector('svg')).toBeInTheDocument()
  })

  it('shows Moon icon in light theme', () => {
    renderBottomBar('light')
    const btn = screen.getByRole('button', { name: 'Toggle Theme' })
    expect(btn.querySelector('svg')).toBeInTheDocument()
  })

  it('calls toggleTheme when clicked', () => {
    renderBottomBar()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Theme' }))
    expect(mockToggleTheme).toHaveBeenCalledOnce()
  })
})
