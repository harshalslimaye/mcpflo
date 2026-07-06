import { useCallback, useEffect, useRef, useState } from 'react'
import type { TestKind, SavedRequest } from '../../../shared/testing.types'

// Debounce window for inline-edit persistence — same value as
// useTestScript's AUTOSAVE_DELAY_MS, for the same reason: short enough that
// an edit survives a tab switch or accidental reload without feeling like a
// "save" step the user has to remember to trigger.
const AUTOSAVE_DELAY_MS = 500

export interface SavedRequestsController {
  requests: SavedRequest[]
  // False until the mount fetch resolves — lets a caller (e.g. the Saved
  // tab's count badge) distinguish "no saved requests" from "still loading".
  loaded: boolean
  // Which single request feeds automated test runs, or undefined if none is
  // marked. Already resolved against `requests` — a dangling id (the marked
  // request was deleted through some other path) reads as undefined here, so
  // no caller needs to separately check existence.
  testRequestId: string | undefined
  add: (name: string, args: Record<string, unknown>) => void
  // Backs the inline Edit form (continuous typing) — debounced, see below.
  updateArgs: (id: string, args: Record<string, unknown>) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  // Pass `undefined` to unmark. Persists immediately, like rename/remove —
  // this is a discrete action, not continuous typing.
  setTestRequestId: (id: string | undefined) => void
}

function randomId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

// Loads a capability's saved requests on mount, and persists edits back to
// disk. `add`/`rename`/`remove` are discrete button actions and persist
// immediately; `updateArgs` backs the inline Edit form's continuous typing
// and is debounce-autosaved, mirroring useTestScript's script-editor
// behavior (including its flush-on-unmount fix — see that hook's comment).
// The owning Request panel remounts on every tool/prompt switch (detail
// views key their subtree by `${serverId}::${name}`), so "unmount" here is
// routine, not a rare app-close event: without the flush, editing a row then
// switching items inside the debounce window would silently drop the edit.
export function useSavedRequests(
  serverId: string,
  kind: TestKind,
  name: string
): SavedRequestsController {
  const [requests, setRequests] = useState<SavedRequest[]>([])
  const [testRequestId, setTestRequestIdState] = useState<string | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  // Mirrors `requests`/`testRequestId` synchronously — the unmount-flush
  // effect's closure is fixed at mount (empty deps), so it reads these
  // instead of the stale values that closure would otherwise have captured.
  const requestsRef = useRef<SavedRequest[]>([])
  const testRequestIdRef = useRef<string | undefined>(undefined)
  // True only while there's a debounced updateArgs edit not yet persisted.
  // add/rename/remove/setTestRequestId persist synchronously and reset this
  // to false, so the debounce effect below (which also re-runs on their
  // state change) skips rather than redundantly re-saving what was just
  // written.
  const editedRef = useRef(false)

  useEffect(() => {
    let active = true
    if (!window.api?.testing) return
    window.api.testing.getRequests(serverId, kind, name).then((file) => {
      if (!active) return
      const next = file?.requests ?? []
      // A dangling testRequestId (the marked request no longer exists) is
      // resolved to undefined once here, so every other read of the field —
      // in this hook or its callers — can trust it without re-checking.
      const resolvedTestRequestId =
        file?.testRequestId && next.some((r) => r.id === file.testRequestId)
          ? file.testRequestId
          : undefined
      setRequests(next)
      requestsRef.current = next
      setTestRequestIdState(resolvedTestRequestId)
      testRequestIdRef.current = resolvedTestRequestId
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [serverId, kind, name])

  // Always writes both fields together — even a debounced updateArgs write
  // must carry the current mark forward, or it would silently strip it from
  // disk on the next autosave tick.
  const persist = useCallback(
    (next: SavedRequest[], nextTestRequestId: string | undefined) => {
      window.api?.testing?.saveRequests(serverId, kind, name, {
        requests: next,
        testRequestId: nextTestRequestId
      })
    },
    [serverId, kind, name]
  )

  // Debounced autosave for updateArgs edits only.
  useEffect(() => {
    if (!editedRef.current) return
    const id = setTimeout(() => {
      persist(requestsRef.current, testRequestIdRef.current)
      editedRef.current = false
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(id)
  }, [requests, persist])

  // Flush-on-unmount: a dedicated effect with no dependencies, so its
  // cleanup fires exactly once, on real unmount — not on every edit (the
  // debounce effect above already has its own cleanup for that).
  useEffect(() => {
    return () => {
      if (editedRef.current) persist(requestsRef.current, testRequestIdRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const add = useCallback(
    (requestName: string, args: Record<string, unknown>) => {
      const now = Date.now()
      const entry: SavedRequest = {
        id: randomId(),
        name: requestName,
        args,
        createdAt: now,
        updatedAt: now
      }
      const next = [...requestsRef.current, entry]
      requestsRef.current = next
      setRequests(next)
      editedRef.current = false
      persist(next, testRequestIdRef.current)
    },
    [persist]
  )

  const updateArgs = useCallback((id: string, args: Record<string, unknown>) => {
    const next = requestsRef.current.map((r) =>
      r.id === id ? { ...r, args, updatedAt: Date.now() } : r
    )
    requestsRef.current = next
    setRequests(next)
    editedRef.current = true
  }, [])

  const rename = useCallback(
    (id: string, requestName: string) => {
      const next = requestsRef.current.map((r) =>
        r.id === id ? { ...r, name: requestName, updatedAt: Date.now() } : r
      )
      requestsRef.current = next
      setRequests(next)
      editedRef.current = false
      persist(next, testRequestIdRef.current)
    },
    [persist]
  )

  const remove = useCallback(
    (id: string) => {
      const next = requestsRef.current.filter((r) => r.id !== id)
      requestsRef.current = next
      setRequests(next)
      // Deleting the marked request clears the mark in this same write —
      // the file must never persist a dangling testRequestId.
      const nextTestRequestId =
        testRequestIdRef.current === id ? undefined : testRequestIdRef.current
      testRequestIdRef.current = nextTestRequestId
      setTestRequestIdState(nextTestRequestId)
      editedRef.current = false
      persist(next, nextTestRequestId)
    },
    [persist]
  )

  const setTestRequestId = useCallback(
    (id: string | undefined) => {
      testRequestIdRef.current = id
      setTestRequestIdState(id)
      editedRef.current = false
      persist(requestsRef.current, id)
    },
    [persist]
  )

  return {
    requests,
    loaded,
    testRequestId,
    add,
    updateArgs,
    rename,
    remove,
    setTestRequestId
  }
}
