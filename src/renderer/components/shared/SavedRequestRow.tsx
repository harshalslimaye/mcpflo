import { useCallback, useMemo, useState } from 'react'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'
import type { IChangeEvent } from '@rjsf/core'
import { ChevronRight, Pencil, Star, Trash2 } from 'lucide-react'
import type { SavedRequest } from '../../../shared/testing.types'
import { RjsfForm } from '../tool/rjsf/RjsfForm'
import { validator } from '../tool/rjsf/validator'

// One saved request: name (or an inline rename field), an args preview, and
// Load/Rename/Delete/"Use for tests" actions. A tool/prompt with parameters
// can expand the row into an inline edit form — a second RjsfForm binding,
// sharing schema/uiSchema with the owning panel's Params tab but its own args
// and its own touched-state (kept local so editing a saved request never
// lights up error state on the live Params form, and vice versa). Shared
// between ToolRequestPanel and PromptRequestPanel — nothing here is tool- or
// prompt-specific; both already source RjsfForm/validator from tool/rjsf.
export function SavedRequestRow({
  request,
  schema,
  uiSchema,
  editable,
  isTestDefault,
  onLoad,
  onUpdateArgs,
  onRename,
  onRemove,
  onSetTestDefault
}: {
  request: SavedRequest
  schema: RJSFSchema
  uiSchema: UiSchema
  editable: boolean
  // Whether this is the single request marked "use for tests" for this
  // capability. Exclusivity (only one row across the whole list can be true)
  // is decided by the owning panel, not this component — see onSetTestDefault.
  isTestDefault: boolean
  onLoad: () => void
  onUpdateArgs: (args: Record<string, unknown>) => void
  onRename: (name: string) => void
  onRemove: () => void
  // Toggles this row's mark. The owning panel is responsible for turning a
  // click into "mark this one" vs "unmark, nothing is marked now" — this
  // component only ever reports "the star was clicked".
  onSetTestDefault: () => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState(request.name)
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const markTouched = useCallback((id: string) => {
    setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])
  const formContext = useMemo(() => ({ touched, markTouched }), [touched, markTouched])

  function commitRename(): void {
    const trimmed = renameText.trim()
    if (trimmed && trimmed !== request.name) onRename(trimmed)
    else setRenameText(request.name)
    setRenaming(false)
  }

  const argKeys = Object.keys(request.args)

  return (
    <div className="flex flex-col border-b border-border-soft last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-[10px]">
        <button
          type="button"
          onClick={() => editable && setExpanded((v) => !v)}
          disabled={!editable}
          className={`flex min-w-0 flex-1 items-center gap-3 text-left ${editable ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {editable ? (
            <ChevronRight
              size={13}
              className={`shrink-0 text-fg-faint transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="w-[13px] shrink-0" />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            {renaming ? (
              <input
                autoFocus
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') {
                    setRenameText(request.name)
                    setRenaming(false)
                  }
                }}
                aria-label="Rename saved request"
                className="w-full rounded border border-accent-line bg-bg-elevated px-1.5 py-0.5 text-[13px] text-text-primary outline-none"
              />
            ) : (
              <span className="truncate text-[13px] font-medium text-text-primary">
                {request.name}
              </span>
            )}
            <span className="truncate text-[11.5px] text-fg-faint">
              {argKeys.length === 0 ? 'no arguments' : argKeys.join(', ')} · Updated{' '}
              {new Date(request.updatedAt).toLocaleString()}
              {isTestDefault && <span className="text-accent"> · Used for tests</span>}
            </span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onSetTestDefault}
            aria-pressed={isTestDefault}
            aria-label={
              isTestDefault
                ? `Stop using ${request.name} for tests`
                : `Use ${request.name} for tests`
            }
            title={isTestDefault ? 'Used for tests — click to unmark' : 'Use for tests'}
            className={`inline-flex items-center justify-center rounded-[6px] p-1 transition-colors ${
              isTestDefault ? 'text-accent' : 'text-fg-faint hover:text-accent'
            }`}
          >
            <Star size={13} fill={isTestDefault ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={onLoad}
            className="rounded-[6px] px-2 py-1 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
          >
            Load
          </button>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            aria-label={`Rename ${request.name}`}
            className="inline-flex items-center justify-center rounded-[6px] p-1 text-fg-faint transition-colors hover:text-accent"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Delete ${request.name}`}
            className="inline-flex items-center justify-center rounded-[6px] p-1 text-fg-faint transition-colors hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {editable && expanded && (
        <div className="border-t border-border-soft bg-bg-elevated/40 px-4 py-3">
          <RjsfForm
            schema={schema}
            uiSchema={uiSchema}
            formContext={formContext}
            validator={validator}
            formData={request.args}
            liveValidate
            showErrorList={false}
            noHtml5Validate
            onChange={(e: IChangeEvent) =>
              onUpdateArgs((e.formData ?? {}) as Record<string, unknown>)
            }
          >
            {/* Replace RJSF's submit button — there is no separate submit here,
                every change persists via the debounced useSavedRequests hook. */}
            <></>
          </RjsfForm>
        </div>
      )}
    </div>
  )
}
