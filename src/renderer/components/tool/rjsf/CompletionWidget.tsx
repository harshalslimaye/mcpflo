import { useCallback, useEffect, useRef, useState } from 'react'
import { ariaDescribedByIds, type WidgetProps } from '@rjsf/utils'
import type { CompletionOutcome } from '../../../../shared/mcp.types'
import { requestCompletion, COMPLETION_DEBOUNCE_MS } from '../../../lib/completion'
import { INPUT_CLASS } from './widgets'
import { readTouched } from './touched'
import { readCompletion } from './completionContext'

// A text input that offers server-provided suggestions as the user types,
// without ever taking away free typing — completion is advisory, not an
// enum. Registered as `widgets.CompletionWidget` (ui:widget: 'CompletionWidget');
// only assigned to a field when the server declares the `completions`
// capability (see promptSchema).
export function CompletionWidget(props: WidgetProps): React.JSX.Element {
  const {
    id,
    name,
    htmlName,
    value,
    readonly,
    disabled,
    autofocus,
    placeholder,
    onBlur,
    onFocus,
    onChange,
    label,
    registry
  } = props

  const completion = readCompletion(registry.formContext)
  const inputValue = value == null ? '' : value

  const [outcome, setOutcome] = useState<CompletionOutcome | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  // Whether the dropdown should show, independent of whether suggestions
  // exist — Esc closes it without discarding the fetched suggestions, so a
  // later ArrowDown/focus can reopen the same list without re-fetching.
  const [open, setOpen] = useState(false)
  // Index into `suggestions`, or -1 for "nothing highlighted".
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  // A "Loading…" row would flicker on every keystroke if shown immediately —
  // most requests resolve well under 250ms. Only surfaced once a request has
  // been pending that long (see fetchSuggestions' delayTimer below), and
  // reset the moment a fresh request starts or the current one resolves.
  const [loadingRowVisible, setLoadingRowVisible] = useState(false)
  // Guards against a slower, older request's response (or its delayed-loading
  // timer) landing after a newer one has already fired — only the request
  // matching the latest seq at settle time is applied. One instance per
  // field (this component is mounted once per form field), so a plain ref is
  // enough — no cross-field key needed the way main's abort map needs one.
  const seqRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const fetchSuggestions = useCallback(
    (typed: string) => {
      if (!completion) return
      const mySeq = ++seqRef.current
      setLoading(true)
      setLoadingRowVisible(false)
      const delayTimer = setTimeout(() => {
        if (seqRef.current === mySeq) setLoadingRowVisible(true)
      }, 250)
      requestCompletion({
        serverId: completion.serverId,
        ref: completion.ref,
        argName: name,
        value: typed,
        contextArgs: completion.getContextArgs(name)
      }).then((result) => {
        clearTimeout(delayTimer)
        if (seqRef.current !== mySeq) return // superseded — drop the stale response
        setLoading(false)
        setLoadingRowVisible(false)
        setOutcome(result)
        // The old highlight likely doesn't correspond to anything in the new
        // list (different length, different values).
        setHighlightedIndex(-1)
      })
    },
    [completion, name]
  )

  // Clears a pending debounce timer left over from the last keystroke before
  // this field unmounts (e.g. the user switches prompts mid-type).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const selectValue = useCallback(
    (v: string) => {
      onChange(v)
      setOpen(false)
      setHighlightedIndex(-1)
    },
    [onChange]
  )

  const input = (
    <input
      id={id}
      name={htmlName || id}
      className={INPUT_CLASS}
      readOnly={readonly}
      disabled={disabled}
      autoFocus={autofocus}
      placeholder={placeholder}
      value={inputValue}
      aria-label={label || name || undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        onBlur(id, e.target.value)
        readTouched(registry.formContext)?.markTouched(id)
      }}
      onFocus={(e) => onFocus(id, e.target.value)}
      aria-describedby={ariaDescribedByIds(id)}
    />
  )

  // No completion context wired (a tool-call form, or a server with no
  // completions support reaching this widget defensively) — behave exactly
  // like a plain text input, no fetching, no wrapper.
  if (!completion) return input

  // Silent by design (D1/D6): zero values or an error/unsupported outcome
  // renders no dropdown at all, same as a plain input that just hasn't found
  // anything yet — never a "no matches" row, never an error row.
  const suggestions = outcome?.values ?? []
  const dropdownOpen = open && suggestions.length > 0
  const listboxId = `${id}-completion-listbox`
  const total = outcome?.total
  const showFooter =
    Boolean(outcome?.hasMore) || (typeof total === 'number' && total > suggestions.length)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    switch (e.key) {
      case 'ArrowDown':
        if (suggestions.length === 0) return
        e.preventDefault()
        setOpen(true)
        setHighlightedIndex((i) => (i + 1) % suggestions.length)
        return
      case 'ArrowUp':
        if (suggestions.length === 0) return
        e.preventDefault()
        setOpen(true)
        setHighlightedIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
        return
      case 'Home':
        // Only hijack Home/End (normally "jump cursor to start/end of text")
        // while the dropdown is actually open with something to jump between.
        if (!dropdownOpen) return
        e.preventDefault()
        setHighlightedIndex(0)
        return
      case 'End':
        if (!dropdownOpen) return
        e.preventDefault()
        setHighlightedIndex(suggestions.length - 1)
        return
      case 'Enter':
        if (dropdownOpen && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          // Must not submit the form — this Enter confirms a suggestion, not
          // the request itself.
          e.preventDefault()
          selectValue(suggestions[highlightedIndex])
        }
        return
      case 'Escape':
        if (dropdownOpen) {
          setOpen(false)
          setHighlightedIndex(-1)
        }
        return
    }
  }

  const completionInput = (
    <input
      id={id}
      name={htmlName || id}
      className={INPUT_CLASS}
      readOnly={readonly}
      disabled={disabled}
      autoFocus={autofocus}
      placeholder={placeholder}
      value={inputValue}
      aria-label={label || name || undefined}
      onChange={(e) => {
        const next = e.target.value
        onChange(next)
        setOpen(true)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => fetchSuggestions(next), COMPLETION_DEBOUNCE_MS)
      }}
      onBlur={(e) => {
        // Mouse selection prevents this from firing before it registers (see
        // the option's onMouseDown), so a real blur here means the user
        // clicked away or tabbed off — close without selecting anything.
        // Touched-error behavior is unchanged from a plain input.
        setOpen(false)
        setHighlightedIndex(-1)
        onBlur(id, e.target.value)
        readTouched(registry.formContext)?.markTouched(id)
      }}
      onFocus={(e) => {
        onFocus(id, e.target.value)
        setOpen(true)
        // Not debounced — a field the user just tabbed into should list its
        // options right away, even before they've typed anything (D1).
        fetchSuggestions(e.target.value)
      }}
      onKeyDown={handleKeyDown}
      aria-describedby={ariaDescribedByIds(id)}
      aria-busy={loading}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={dropdownOpen}
      aria-controls={dropdownOpen ? listboxId : undefined}
      aria-activedescendant={
        dropdownOpen && highlightedIndex >= 0
          ? `${id}-completion-option-${highlightedIndex}`
          : undefined
      }
    />
  )

  return (
    <div className="relative">
      {completionInput}
      {dropdownOpen && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-[8px] border border-border bg-bg-elevated py-1 shadow-lg"
        >
          {suggestions.map((v, i) => (
            <li
              key={v}
              id={`${id}-completion-option-${i}`}
              role="option"
              aria-selected={i === highlightedIndex}
              // onMouseDown (not onClick) fires before the input's blur, so
              // preventing its default here keeps focus on the input —
              // otherwise blur would close the dropdown before the click
              // even registers.
              onMouseDown={(e) => {
                e.preventDefault()
                selectValue(v)
              }}
              className={`cursor-default px-[13px] py-[8px] font-mono text-[13px] ${
                i === highlightedIndex ? 'bg-accent-soft text-text-primary' : 'text-text-primary'
              }`}
            >
              {v}
            </li>
          ))}
          {showFooter && (
            <li
              aria-hidden="true"
              className="px-[13px] py-[6px] font-mono text-[11px] text-text-muted"
            >
              {typeof total === 'number'
                ? `Showing ${suggestions.length} of ${total}`
                : 'More results available'}
            </li>
          )}
          {loadingRowVisible && (
            <li
              aria-hidden="true"
              className="px-[13px] py-[6px] font-mono text-[11px] text-text-muted"
            >
              Loading…
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
