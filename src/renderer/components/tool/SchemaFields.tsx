import { Toggle } from '../ui/Toggle'
import type { FormValues, PrimitiveField } from '../../lib/toolSchema'

// Schema-driven field primitives shared by the tool Params form and the
// elicitation modal.

export function FieldRow({
  field,
  children
}: {
  field: PrimitiveField
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-text-muted font-mono">
        {field.title ?? field.name}
        {field.required && <span className="text-accent ml-0.5">*</span>}
      </label>
      {field.description && (
        <p className="text-xs text-text-muted opacity-70 leading-snug">{field.description}</p>
      )}
      {children}
    </div>
  )
}

export function FieldInput({
  field,
  value,
  onChange
}: {
  field: PrimitiveField
  value: FormValues[string]
  onChange: (value: FormValues[string]) => void
}): React.JSX.Element {
  const inputClass =
    'w-full px-3 py-1.5 rounded border border-border bg-bg-elevated text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors'

  if (field.kind === 'boolean') {
    return <Toggle checked={value === true} onChange={onChange} aria-label={field.name} />
  }

  if (field.kind === 'enum') {
    return (
      <select
        aria-label={field.name}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        <option value="">{field.required ? 'Select…' : '(none)'}</option>
        {(field.enumValues ?? []).map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    )
  }

  if (field.kind === 'number' || field.kind === 'integer') {
    return (
      <input
        type="number"
        aria-label={field.name}
        value={String(value)}
        step={field.kind === 'integer' ? 1 : 'any'}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    )
  }

  return (
    <input
      type="text"
      aria-label={field.name}
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  )
}
