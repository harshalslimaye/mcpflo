import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import type { MCPServer } from '../../../shared/mcp.types'
import { useServerStore } from '../../stores/serverStore'

interface TestsFolderCardProps {
  server: MCPServer
}

interface FolderStatus {
  path: string
  isCustom: boolean
  exists: boolean
}

// Lets the user point this server's test scripts (the Tests tab on its
// tools/prompts/resources — see TestScriptEditor) at a folder of their own
// choosing instead of the app's default `<userData>/tests/<serverId>`
// location. Mirrors AuthDetailsCard's async-load pattern: the header renders
// immediately, only the body waits on the main-process round trip.
//
// Collapsed by default: this is a settings affordance, not primary Overview
// content, so it shouldn't compete with Auth/Budget for vertical space.
export function TestsFolderCard({ server }: TestsFolderCardProps): React.JSX.Element {
  const updateServer = useServerStore((s) => s.updateServer)
  // undefined = not yet fetched, null = the fetch itself failed.
  const [status, setStatus] = useState<FolderStatus | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Re-fetches whenever `server.testsPath` changes — after Choose/Use default
  // below call `updateServer`, the store updates and this component receives
  // a new `server` prop, so there's no separate manual-refresh call needed.
  useEffect(() => {
    if (!window.api?.testing) return
    let active = true
    window.api.testing
      .getTestsFolderStatus(server.id)
      .then((s) => {
        if (active) setStatus(s)
      })
      .catch(() => {
        if (active) setStatus(null)
      })
    return () => {
      active = false
    }
  }, [server.id, server.testsPath])

  async function handleChoose(): Promise<void> {
    if (!window.api?.testing) return
    setBusy(true)
    try {
      const folder = await window.api.testing.chooseTestsFolder(server.id)
      if (folder) await updateServer(server.id, { testsPath: folder })
    } finally {
      setBusy(false)
    }
  }

  async function handleUseDefault(): Promise<void> {
    setBusy(true)
    try {
      await updateServer(server.id, { testsPath: undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-3 bg-panel-2 px-4 py-[11px] text-left transition-colors hover:bg-bg-elevated"
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-text-muted" />
        )}
        <Folder size={14} className="shrink-0 text-fg-faint" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
          Tests Folder
        </span>
        <div className="flex-1" />
        {status?.isCustom && (
          <span className="text-[12.5px] font-medium text-text-muted">Custom</span>
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2.5 border-t border-border px-4 py-[14px]">
          {status === undefined ? (
            <span className="text-[12.5px] text-text-muted">Loading…</span>
          ) : status === null ? (
            <span className="text-[12.5px] text-text-muted">
              Unable to load tests folder status.
            </span>
          ) : (
            <>
              {status.isCustom && !status.exists && (
                <div className="rounded border border-orange-500/40 bg-orange-500/5 px-3 py-2">
                  <p className="font-mono text-[11px] font-semibold tracking-wide text-orange-500 uppercase">
                    Folder not found
                  </p>
                  <p className="mt-1 text-[12.5px] text-text-primary">
                    {
                      "This folder may have been moved or deleted. Test scripts won't be found or saved until you choose a new folder or switch back to the default."
                    }
                  </p>
                </div>
              )}
              <span
                className="block truncate font-mono text-[12px] text-text-primary"
                title={status.path}
              >
                {status.path}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleChoose}
                  disabled={busy}
                  className="font-mono text-[11px] text-fg-faint transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Choose folder…
                </button>
                {status.isCustom && (
                  <button
                    type="button"
                    onClick={handleUseDefault}
                    disabled={busy}
                    className="font-mono text-[11px] text-fg-faint transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Use default
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
