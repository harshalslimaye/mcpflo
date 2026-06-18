import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): React.JSX.Element {
  throw new Error('render exploded')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>healthy</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('healthy')).toBeInTheDocument()
  })

  it('shows the fallback with the error message when a child throws', () => {
    // React logs the caught error; silence it to keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('render exploded')).toBeInTheDocument()
  })

  it('reloads the window when Reload is clicked', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true
    })
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
