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
  it('renders the Report an Issue and Toggle Theme buttons', () => {
    const { container } = renderBottomBar()
    expect(screen.getByRole('button', { name: 'Report an Issue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle Theme' })).toBeInTheDocument()
    expect(container.querySelectorAll('button')).toHaveLength(2)
  })

  it('opens the issues page when Report an Issue is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderBottomBar()
    fireEvent.click(screen.getByRole('button', { name: 'Report an Issue' }))
    expect(openSpy).toHaveBeenCalledWith(
      'https://github.com/harshalslimaye/mcpflo/issues',
      '_blank'
    )
    openSpy.mockRestore()
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
