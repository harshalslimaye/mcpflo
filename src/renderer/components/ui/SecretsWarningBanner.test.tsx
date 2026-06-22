import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SecretsWarningBanner } from './SecretsWarningBanner'
import { useServerStore } from '../../stores/serverStore'

function setPlaintext(value: boolean): void {
  act(() => useServerStore.setState({ secretsPlaintext: value }))
}

beforeEach(() => {
  vi.clearAllMocks()
  useServerStore.setState({ secretsPlaintext: false })
})

describe('SecretsWarningBanner', () => {
  it('renders nothing when secrets are encrypted', () => {
    setPlaintext(false)
    const { container } = render(<SecretsWarningBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('warns when secrets are stored as plaintext', () => {
    setPlaintext(true)
    render(<SecretsWarningBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent(/unencrypted/i)
  })

  it('can be dismissed for the session', () => {
    setPlaintext(true)
    render(<SecretsWarningBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
