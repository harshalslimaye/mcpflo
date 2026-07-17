import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BottomBar } from './BottomBar'
import { useThemeStore } from '../../stores/themeStore'
import { useUpdaterStore } from '../../stores/updaterStore'
import { useErrorStore } from '../../stores/errorStore'
import type { UpdateStatus } from '../../../shared/updater.types'

const mockToggleTheme = vi.fn()
const mockCheck = vi.fn()
const mockInstall = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useUpdaterStore.setState({ status: null, check: mockCheck, install: mockInstall })
  useErrorStore.setState({ toasts: [] })
})

function renderBottomBar(theme: 'dark' | 'light' = 'dark'): ReturnType<typeof render> {
  useThemeStore.setState({ theme, toggleTheme: mockToggleTheme })
  return render(<BottomBar />)
}

function setUpdaterStatus(status: UpdateStatus): void {
  useUpdaterStore.setState({ status })
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

describe('BottomBar update control', () => {
  it('renders nothing before the initial status snapshot arrives', () => {
    const { container } = renderBottomBar()
    expect(container.querySelectorAll('button')).toHaveLength(2)
  })

  it('shows the version and checks for updates on click when idle', async () => {
    setUpdaterStatus({ state: 'idle', currentVersion: '0.2.0' })
    renderBottomBar()
    const btn = screen.getByRole('button', { name: 'Check for updates' })
    expect(btn).toHaveTextContent('v0.2.0')
    mockCheck.mockResolvedValue(undefined)
    fireEvent.click(btn)
    await waitFor(() => expect(mockCheck).toHaveBeenCalledOnce())
  })

  it('shows a disabled spinner while downloading', () => {
    setUpdaterStatus({ state: 'downloading', currentVersion: '0.2.0', percent: 42 })
    renderBottomBar()
    const btn = screen.getByRole('button', { name: /Downloading update/ })
    expect(btn).toBeDisabled()
    expect(btn.querySelector('svg')).toBeInTheDocument()
  })

  it('shows Restart to update once downloaded, and installs on click', () => {
    setUpdaterStatus({
      state: 'downloaded',
      currentVersion: '0.2.0',
      availableVersion: '0.3.0'
    })
    renderBottomBar()
    const btn = screen.getByRole('button', { name: 'Restart to update' })
    fireEvent.click(btn)
    expect(mockInstall).toHaveBeenCalledOnce()
  })

  it('pushes an error toast only when a manual check fails', async () => {
    setUpdaterStatus({ state: 'idle', currentVersion: '0.2.0' })
    mockCheck.mockImplementation(async () => {
      useUpdaterStore.setState({
        status: { state: 'error', currentVersion: '0.2.0', message: 'network down' }
      })
    })
    renderBottomBar()

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    await waitFor(() =>
      expect(useErrorStore.getState().toasts.map((t) => t.message)).toContain('network down')
    )
  })

  it('does not toast a silent startup error the app already started in', () => {
    setUpdaterStatus({ state: 'error', currentVersion: '0.2.0', message: 'signature invalid' })
    renderBottomBar()
    expect(useErrorStore.getState().toasts).toHaveLength(0)
  })

  it('falls back to a generic message when a failed check carries none', async () => {
    setUpdaterStatus({ state: 'idle', currentVersion: '0.2.0' })
    mockCheck.mockImplementation(async () => {
      useUpdaterStore.setState({ status: { state: 'error', currentVersion: '0.2.0' } })
    })
    renderBottomBar()

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    await waitFor(() =>
      expect(useErrorStore.getState().toasts.map((t) => t.message)).toContain('Update check failed')
    )
  })
})
