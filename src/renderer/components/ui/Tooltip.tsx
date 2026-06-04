import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  label: string
  children: React.ReactElement
  side?: 'right' | 'top' | 'bottom' | 'left'
  delayMs?: number
}

export function Tooltip({ label, children, side = 'right', delayMs = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return
      const r = triggerRef.current.getBoundingClientRect()
      const GAP = 6
      let top = 0
      let left = 0
      if (side === 'right') {
        top = r.top + r.height / 2
        left = r.right + GAP
      } else if (side === 'left') {
        top = r.top + r.height / 2
        left = r.left - GAP
      } else if (side === 'top') {
        top = r.top - GAP
        left = r.left + r.width / 2
      } else {
        top = r.bottom + GAP
        left = r.left + r.width / 2
      }
      setCoords({ top, left })
      setVisible(true)
    }, delayMs)
  }, [side, delayMs])

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <>
      {React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }>, {
        ref: triggerRef,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      })}
      {visible &&
        createPortal(
          <div
            role="tooltip"
            style={
              side === 'right'
                ? { top: coords.top, left: coords.left, transform: 'translateY(-50%)' }
                : side === 'left'
                  ? { top: coords.top, left: coords.left, transform: 'translate(-100%, -50%)' }
                  : side === 'top'
                    ? { top: coords.top, left: coords.left, transform: 'translate(-50%, -100%)' }
                    : { top: coords.top, left: coords.left, transform: 'translateX(-50%)' }
            }
            className="fixed z-50 px-2 py-1 rounded text-xs text-white bg-[#1a1a1a] dark:bg-[#ececec] dark:text-[#1a1a1a] whitespace-nowrap pointer-events-none shadow-md"
          >
            {label}
          </div>,
          document.body
        )}
    </>
  )
}
