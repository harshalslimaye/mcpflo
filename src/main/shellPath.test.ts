import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveShellPath, resetShellPathCache } from './shellPath'

const marker = '__MCPFLO_PATH__'
const wrap = (path: string): string => `${marker}${path}${marker}\n`

describe('resolveShellPath', () => {
  const originalPath = process.env.PATH
  const originalPlatform = process.platform

  beforeEach(() => {
    resetShellPathCache()
    process.env.PATH = '/inherited/bin'
  })

  afterEach(() => {
    process.env.PATH = originalPath
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('returns the PATH the login shell prints, stripped of marker wrapping', () => {
    const runner = vi.fn(() => wrap('/opt/homebrew/bin:/usr/bin'))
    expect(resolveShellPath(runner)).toBe('/opt/homebrew/bin:/usr/bin')
  })

  it('asks an interactive login shell to echo the marker-delimited PATH', () => {
    process.env.SHELL = '/bin/zsh'
    const runner = vi.fn(() => wrap('/x'))
    resolveShellPath(runner)
    expect(runner).toHaveBeenCalledWith(`/bin/zsh -ilc 'echo "${marker}\${PATH}${marker}"'`)
  })

  it('ignores rc-file noise printed before the delimited PATH', () => {
    const runner = vi.fn(() => `welcome to your shell\n${wrap('/opt/homebrew/bin')}`)
    expect(resolveShellPath(runner)).toBe('/opt/homebrew/bin')
  })

  it('falls back to the inherited PATH when the shell errors', () => {
    const runner = vi.fn(() => {
      throw new Error('no shell')
    })
    expect(resolveShellPath(runner)).toBe('/inherited/bin')
  })

  it('falls back to the inherited PATH when the shell prints an empty PATH', () => {
    const runner = vi.fn(() => wrap(''))
    expect(resolveShellPath(runner)).toBe('/inherited/bin')
  })

  it('caches the result so the shell is queried only once', () => {
    const runner = vi.fn(() => wrap('/cached/bin'))
    expect(resolveShellPath(runner)).toBe('/cached/bin')
    expect(resolveShellPath(runner)).toBe('/cached/bin')
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('returns the inherited PATH without invoking a shell on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const runner = vi.fn(() => wrap('/should/not/be/used'))
    expect(resolveShellPath(runner)).toBe('/inherited/bin')
    expect(runner).not.toHaveBeenCalled()
  })
})
