import { useCallback, useEffect, useRef, useState } from 'react'
import type { TestKind } from '../../../shared/testing.types'

// Debounce window between the user's last keystroke in the Tests editor and
// the autosave IPC call — short enough that a script survives a tab switch or
// an accidental reload without feeling like a "save" step the user has to
// remember to trigger.
const AUTOSAVE_DELAY_MS = 500

export interface TestScriptController {
  script: string
  hasScript: boolean
  onChange: (next: string) => void
}

// Loads a saved test script on mount, debounce-autosaves edits, and flushes
// any not-yet-saved edit on unmount instead of dropping it. Shared by the
// Tool/Prompt/Resource Request panels' Tests tab (previously ~25 lines of
// near-identical load/autosave/dot-indicator logic copy-pasted three times).
//
// The flush-on-unmount matters here specifically because the owning panel
// remounts on every item switch (ToolDetailView etc. key their subtree by
// `${serverId}::${name}`) — so "unmount" isn't a rare app-close event, it's
// every tab switch. Without it, typing then switching items inside the
// debounce window silently drops the last keystrokes: the pending
// setTimeout gets cleared, but nothing had saved yet.
export function useTestScript(
  serverId: string,
  kind: TestKind,
  name: string
): TestScriptController {
  const [script, setScript] = useState('')
  // Mirrors `script` synchronously — the unmount-flush effect below (empty
  // deps, so its closure is fixed at mount) reads this instead of the
  // stale `script` value its own closure would otherwise have captured.
  const scriptRef = useRef('')
  const editedRef = useRef(false)

  useEffect(() => {
    let active = true
    if (!window.api?.testing) return
    window.api.testing.getScript(serverId, kind, name).then((saved) => {
      if (!active) return
      setScript(saved ?? '')
      scriptRef.current = saved ?? ''
    })
    return () => {
      active = false
    }
  }, [serverId, kind, name])

  // Debounced autosave — only once the user has actually typed, so
  // re-saving the just-loaded content back to disk on mount is skipped.
  useEffect(() => {
    if (!editedRef.current || !window.api?.testing) return
    const id = setTimeout(() => {
      window.api.testing.saveScript(serverId, kind, name, scriptRef.current)
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(id)
  }, [script, serverId, kind, name])

  // Flush-on-unmount: a dedicated effect with no dependencies, so its
  // cleanup fires exactly once, on real unmount — not on every keystroke
  // (the debounce effect above already has its own cleanup for that, which
  // must stay a plain `clearTimeout`, or every edit would save immediately
  // and defeat the debounce).
  useEffect(() => {
    return () => {
      if (editedRef.current && window.api?.testing) {
        window.api.testing.saveScript(serverId, kind, name, scriptRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onChange = useCallback((next: string) => {
    editedRef.current = true
    scriptRef.current = next
    setScript(next)
  }, [])

  return { script, hasScript: script.trim() !== '', onChange }
}
