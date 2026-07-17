import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUpdaterStore } from './updaterStore'
import type { UpdateStatus } from '../../shared/updater.types'

describe('updaterStore', () => {
  let getStatus: ReturnType<typeof vi.fn>
  let check: ReturnType<typeof vi.fn>
  let install: ReturnType<typeof vi.fn>
  let onUpdateEvent: ReturnType<typeof vi.fn>
  let unsubscribe: ReturnType<typeof vi.fn>
  let eventCallback: ((status: UpdateStatus) => void) | undefined

  beforeEach(() => {
    useUpdaterStore.setState({ status: null })
    unsubscribe = vi.fn()
    eventCallback = undefined
    getStatus = vi.fn()
    check = vi.fn()
    install = vi.fn().mockResolvedValue(undefined)
    onUpdateEvent = vi.fn((cb: (status: UpdateStatus) => void) => {
      eventCallback = cb
      return unsubscribe
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { updater: { getStatus, check, install, onUpdateEvent } }
    })
  })

  afterEach(() => {
    // @ts-expect-error test-only cleanup of a global stubbed above.
    delete window.api
  })

  it('subscribes to update events and pulls the initial snapshot on hydrate', async () => {
    const idle: UpdateStatus = { state: 'idle', currentVersion: '0.2.0' }
    getStatus.mockResolvedValue(idle)

    const unsub = useUpdaterStore.getState().hydrate()

    expect(onUpdateEvent).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(useUpdaterStore.getState().status).toEqual(idle))
    expect(unsub).toBe(unsubscribe)
  })

  it('applies pushed events as they arrive after hydrate', async () => {
    getStatus.mockResolvedValue({ state: 'idle', currentVersion: '0.2.0' })
    useUpdaterStore.getState().hydrate()
    await vi.waitFor(() => expect(useUpdaterStore.getState().status?.state).toBe('idle'))

    const downloading: UpdateStatus = {
      state: 'downloading',
      currentVersion: '0.2.0',
      availableVersion: '0.3.0',
      percent: 50
    }
    eventCallback?.(downloading)

    expect(useUpdaterStore.getState().status).toEqual(downloading)
  })

  it('check() replaces status with the manual check result', async () => {
    const result: UpdateStatus = { state: 'not-available', currentVersion: '0.2.0' }
    check.mockResolvedValue(result)

    await useUpdaterStore.getState().check()

    expect(check).toHaveBeenCalledOnce()
    expect(useUpdaterStore.getState().status).toEqual(result)
  })

  it('install() delegates to the preload bridge', async () => {
    await useUpdaterStore.getState().install()
    expect(install).toHaveBeenCalledOnce()
  })
})
