import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { clampDockHeight, useResultDock, DOCK_MIN, DOCK_BOTTOM_CLAMP } from './useResultDock'

describe('clampDockHeight', () => {
  it('floors at DOCK_MIN', () => {
    expect(clampDockHeight(10, 800)).toBe(DOCK_MIN)
  })

  it('caps at containerHeight − DOCK_BOTTOM_CLAMP', () => {
    expect(clampDockHeight(9999, 800)).toBe(800 - DOCK_BOTTOM_CLAMP)
  })

  it('passes a value inside the band through unchanged', () => {
    expect(clampDockHeight(300, 800)).toBe(300)
  })

  it('never returns below DOCK_MIN even for a tiny container', () => {
    expect(clampDockHeight(500, 50)).toBe(DOCK_MIN)
  })
})

describe('useResultDock', () => {
  beforeEach(() => localStorage.clear())

  it('starts minimized (collapsed) with no explicit height', () => {
    const { result } = renderHook(() => useResultDock())
    expect(result.current.collapsed).toBe(true)
    expect(result.current.full).toBe(false)
    expect(result.current.heightPx).toBeNull()
  })

  it('reveal opens the minimized dock', () => {
    const { result } = renderHook(() => useResultDock())
    expect(result.current.collapsed).toBe(true)
    act(() => result.current.reveal())
    expect(result.current.collapsed).toBe(false)
  })

  it('toggleCollapse clears full and toggles collapsed', () => {
    const { result } = renderHook(() => useResultDock())
    act(() => result.current.toggleMax())
    expect(result.current.full).toBe(true)

    act(() => result.current.toggleCollapse())
    expect(result.current.full).toBe(false)
    expect(result.current.collapsed).toBe(true)
  })

  it('toggleMax clears collapsed and toggles full', () => {
    const { result } = renderHook(() => useResultDock())
    act(() => result.current.collapse())
    expect(result.current.collapsed).toBe(true)

    act(() => result.current.toggleMax())
    expect(result.current.collapsed).toBe(false)
    expect(result.current.full).toBe(true)
  })

  it('reveal clears collapsed', () => {
    const { result } = renderHook(() => useResultDock())
    act(() => result.current.collapse())
    act(() => result.current.reveal())
    expect(result.current.collapsed).toBe(false)
  })

  it('persists the dragged height to localStorage and rehydrates it', () => {
    const { result } = renderHook(() => useResultDock())
    act(() => result.current.setHeightPx(320))
    expect(result.current.heightPx).toBe(320)

    const { result: rehydrated } = renderHook(() => useResultDock())
    expect(rehydrated.current.heightPx).toBe(320)
  })

  it('exposes the clamp tuning knobs', () => {
    expect(DOCK_MIN).toBeGreaterThan(0)
    expect(DOCK_BOTTOM_CLAMP).toBeGreaterThan(DOCK_MIN)
  })
})
