import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Toaster } from './Toaster'
import { useErrorStore } from '../../stores/errorStore'

// Store mutations happen outside React's event handlers, so wrap them in act()
// to flush the subscribed component's re-render before asserting.
function pushError(message: string): void {
  act(() => useErrorStore.getState().pushError(message))
}

beforeEach(() => {
  vi.useFakeTimers()
  useErrorStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toaster', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<Toaster />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders a toast pushed to the error store', () => {
    render(<Toaster />)
    pushError('Server already exists')
    expect(screen.getByRole('alert')).toHaveTextContent('Server already exists')
  })

  it('renders one alert per toast', () => {
    render(<Toaster />)
    pushError('a')
    pushError('b')
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })

  it('dismisses a toast when its close button is clicked', () => {
    render(<Toaster />)
    pushError('boom')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
