import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { clampDockHeight, DOCK_MIN, type DockController } from './useResultDock'

interface ResultDockProps {
  // The full-height center area used as the drag reference frame.
  containerRef: RefObject<HTMLDivElement | null>
  dock: DockController
  // The result view (its panel header carries the collapse/maximize buttons).
  children: React.ReactNode
}

// A height-controlled slot anchored to the bottom of the center column. Owns the
// drag grip and resolves its own height from the dock state; the response panel
// chrome (status, tabs, collapse/maximize buttons) lives in `children`.
export function ResultDock({ containerRef, dock, children }: ResultDockProps): React.JSX.Element {
  const { collapsed, full, heightPx } = dock
  const gripRef = useRef<HTMLDivElement>(null)
  // Animate collapse/maximize toggles, but not the live drag — a transition
  // during a drag lags the pointer.
  const [dragging, setDragging] = useState(false)

  const height = collapsed
    ? `${DOCK_MIN}px`
    : full
      ? '100%'
      : heightPx != null
        ? `${heightPx}px`
        : '44%'

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    if (!containerRef.current) return
    e.preventDefault()
    gripRef.current?.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    const container = containerRef.current
    if (!container || !gripRef.current?.hasPointerCapture(e.pointerId)) return
    const rect = container.getBoundingClientRect()
    const raw = rect.bottom - e.clientY
    // Dragged to the floor → collapse to the slim status bar.
    if (raw <= DOCK_MIN) {
      dock.collapse()
      return
    }
    dock.setHeightPx(clampDockHeight(raw, rect.height))
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>): void {
    gripRef.current?.releasePointerCapture(e.pointerId)
    setDragging(false)
  }

  return (
    <section
      className={`relative flex min-h-0 shrink-0 flex-col border-t border-border bg-bg-surface ${
        dragging ? '' : 'transition-[height] duration-200 ease-out motion-reduce:transition-none'
      }`}
      style={{ height }}
    >
      {!collapsed && !full && (
        <div
          ref={gripRef}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize response"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="absolute inset-x-0 -top-1 z-10 flex h-[9px] cursor-row-resize touch-none items-center justify-center"
        >
          <div className="h-1 w-10 rounded-full bg-border-soft transition-colors hover:bg-border" />
        </div>
      )}
      {children}
    </section>
  )
}
