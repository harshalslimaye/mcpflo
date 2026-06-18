import { useCallback, useState } from 'react'

// Tuning knobs. The dock never shrinks below a slim status bar, and a drag can
// never eat the whole center column — at least DOCK_BOTTOM_CLAMP px stay above
// for the form.
export const DOCK_MIN = 46
export const DOCK_BOTTOM_CLAMP = 120

const STORAGE_KEY = 'mcpflo.dockHeightPx'

// Clamp a raw drag height to [DOCK_MIN, containerHeight − DOCK_BOTTOM_CLAMP].
// Pure so the drag math can be unit-tested without a DOM.
export function clampDockHeight(raw: number, containerHeight: number): number {
  const max = Math.max(DOCK_MIN, containerHeight - DOCK_BOTTOM_CLAMP)
  return Math.min(max, Math.max(DOCK_MIN, raw))
}

export interface DockController {
  collapsed: boolean
  full: boolean
  // null ⇒ use the default (44% of the center height).
  heightPx: number | null
  toggleCollapse: () => void
  toggleMax: () => void
  // Clears `collapsed` so a fresh run reveals the response.
  reveal: () => void
  collapse: () => void
  setHeightPx: (px: number) => void
}

// Local UI state for the result dock: collapsed/full flags plus a sticky pixel
// height persisted across tools (and sessions) in localStorage.
export function useResultDock(): DockController {
  // Minimized by default: on load the dock is a slim status bar so the form
  // owns the column; `reveal()` (called on execute) opens it after a run.
  const [collapsed, setCollapsed] = useState(true)
  const [full, setFull] = useState(false)
  const [heightPx, setHeightPxState] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : null
  })

  const setHeightPx = useCallback((px: number) => {
    setHeightPxState(px)
    localStorage.setItem(STORAGE_KEY, String(px))
  }, [])

  const toggleCollapse = useCallback(() => {
    setFull(false)
    setCollapsed((c) => !c)
  }, [])

  const toggleMax = useCallback(() => {
    setCollapsed(false)
    setFull((f) => !f)
  }, [])

  const reveal = useCallback(() => setCollapsed(false), [])
  const collapse = useCallback(() => setCollapsed(true), [])

  return { collapsed, full, heightPx, toggleCollapse, toggleMax, reveal, collapse, setHeightPx }
}
