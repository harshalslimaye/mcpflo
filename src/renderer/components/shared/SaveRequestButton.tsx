import { useState } from 'react'

// A small "Save" button in the Request panel's footer (next to Execute) that
// opens an anchored popover — a name field plus Save/Cancel — instead of
// requiring a trip to the Saved tab. Deliberately no click-outside-to-close:
// Escape and the two buttons are enough, and it keeps this self-contained
// (no extra ref/listener plumbing) — same simplicity trade-off the popover's
// predecessor (the Saved tab's own inline "Save current as…" row) already
// made. Shared by ToolRequestPanel and PromptRequestPanel; nothing here is
// tool- or prompt-specific.
export function SaveRequestButton({
  disabled,
  requestCount,
  onSave
}: {
  disabled: boolean
  // Used to default the popover's name field to "Request N" when left blank.
  requestCount: number
  onSave: (name: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function close(): void {
    setOpen(false)
    setName('')
  }

  function commit(): void {
    onSave(name.trim() || `Request ${requestCount + 1}`)
    close()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="rounded-[8px] border border-border bg-bg-elevated px-3 py-[9px] text-[13px] font-medium text-text-primary transition-colors hover:border-accent-line disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save
      </button>
      {open && (
        <div className="absolute right-0 bottom-full z-10 mb-2 flex w-64 flex-col gap-2 rounded-[10px] border border-border bg-bg-surface p-3 shadow-lg">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Request ${requestCount + 1}`}
            aria-label="New saved request name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') close()
            }}
            className="w-full rounded-[8px] border border-border bg-bg-elevated px-3 py-[7px] text-[13px] text-text-primary outline-none focus:border-accent-line focus:ring-[3px] focus:ring-accent-soft"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-[8px] px-3 py-[7px] text-[12.5px] text-text-muted transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              aria-label="Confirm save request"
              className="rounded-[8px] bg-[image:var(--btn)] px-3 py-[7px] text-[12.5px] font-bold text-white transition-[filter] hover:brightness-110"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
