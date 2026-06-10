interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  'aria-label': string
  disabled?: boolean
}

export function Toggle({
  checked,
  onChange,
  'aria-label': ariaLabel,
  disabled = false
}: ToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-accent' : 'bg-bg-elevated border border-border'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
