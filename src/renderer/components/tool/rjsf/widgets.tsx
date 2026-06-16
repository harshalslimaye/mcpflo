import {
  ariaDescribedByIds,
  enumOptionSelectedValue,
  enumOptionValueDecoder,
  enumOptionValueEncoder,
  getInputProps,
  getOptionValueFormat,
  type BaseInputTemplateProps,
  type RegistryWidgetsType,
  type WidgetProps
} from '@rjsf/utils'
import { Toggle } from '../../ui/Toggle'

// Widgets/templates that map RJSF's inputs onto MCPFlo's existing dark Tailwind
// look. They mirror the markup the hand-rolled Params form used (see the retired
// `SchemaFields` styling) so any JSON Schema renders consistently.

// The shared input class — kept in sync with the textarea/select styling used
// across the Request panel.
const INPUT_CLASS =
  'w-full rounded-[8px] border border-border bg-bg-elevated px-[13px] py-[11px] font-mono text-[13.5px] text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent-line focus:ring-[3px] focus:ring-accent-soft disabled:opacity-50'

// Renders the `<input>` for every text/number widget. Mirrors core's
// BaseInputTemplate but with our class and an `aria-label` so fields stay
// queryable by their property label.
function BaseInputTemplate(props: BaseInputTemplateProps): React.JSX.Element {
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
    onChangeOverride,
    options,
    schema,
    label,
    type
  } = props
  // Only the input-relevant attributes; we deliberately don't spread the rest of
  // the RJSF props (registry, uiSchema, …) onto the DOM node.
  const inputProps = getInputProps(schema, type, options)
  const inputValue =
    inputProps.type === 'number' || inputProps.type === 'integer'
      ? value || value === 0
        ? value
        : ''
      : value == null
        ? ''
        : value

  return (
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
      {...inputProps}
      onChange={
        onChangeOverride ||
        ((e) => onChange(e.target.value === '' ? options.emptyValue : e.target.value))
      }
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
      aria-describedby={ariaDescribedByIds(id)}
    />
  )
}

function TextareaWidget({
  id,
  name,
  value,
  readonly,
  disabled,
  autofocus,
  onBlur,
  onFocus,
  onChange,
  options,
  label
}: WidgetProps): React.JSX.Element {
  const rows = typeof options.rows === 'number' ? options.rows : 4
  return (
    <textarea
      id={id}
      name={id}
      className={`${INPUT_CLASS} resize-y`}
      value={value == null ? '' : value}
      rows={rows}
      readOnly={readonly}
      disabled={disabled}
      autoFocus={autofocus}
      spellCheck={false}
      aria-label={label || name || undefined}
      onChange={(e) => onChange(e.target.value === '' ? options.emptyValue : e.target.value)}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
      aria-describedby={ariaDescribedByIds(id)}
    />
  )
}

function SelectWidget({
  schema,
  id,
  name,
  options,
  value,
  required,
  disabled,
  readonly,
  autofocus,
  onChange,
  onBlur,
  onFocus,
  placeholder,
  label
}: WidgetProps): React.JSX.Element {
  const { enumOptions, enumDisabled, emptyValue: optEmptyVal } = options
  const optionValueFormat = getOptionValueFormat(options)
  const selectValue = enumOptionSelectedValue(value, enumOptions, false, optionValueFormat, '')
  // Show a placeholder option only when the field has no schema default, matching
  // core's behavior — and use it to express "required" vs optional emptiness.
  const showPlaceholderOption = schema.default === undefined
  const decode = (raw: string): unknown =>
    enumOptionValueDecoder(raw, enumOptions, optionValueFormat, optEmptyVal)

  return (
    <select
      id={id}
      name={id}
      className={INPUT_CLASS}
      value={selectValue}
      required={required}
      disabled={disabled || readonly}
      autoFocus={autofocus}
      aria-label={label || name || undefined}
      onChange={(e) => onChange(decode(e.target.value))}
      onBlur={(e) => onBlur(id, decode(e.target.value))}
      onFocus={(e) => onFocus(id, decode(e.target.value))}
      aria-describedby={ariaDescribedByIds(id)}
    >
      {showPlaceholderOption && (
        <option value="">{placeholder || (required ? 'Select…' : '(none)')}</option>
      )}
      {Array.isArray(enumOptions) &&
        enumOptions.map(({ value: enumValue, label: enumLabel }, i) => (
          <option
            key={String(enumValue)}
            value={enumOptionValueEncoder(enumValue, i, optionValueFormat)}
            disabled={Array.isArray(enumDisabled) && enumDisabled.includes(enumValue)}
          >
            {enumLabel}
          </option>
        ))}
    </select>
  )
}

// Boolean fields render as the app's Toggle with the label inline, since the
// FieldTemplate suppresses its own label for checkbox-style widgets.
function CheckboxWidget({
  id,
  value,
  disabled,
  readonly,
  label,
  onChange
}: WidgetProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <Toggle
        checked={value === true}
        onChange={(checked) => onChange(checked)}
        aria-label={label || id}
        disabled={disabled || readonly}
      />
      {label && <span className="font-mono text-[13px] text-text-primary">{label}</span>}
    </div>
  )
}

export const widgets: RegistryWidgetsType = {
  TextareaWidget,
  SelectWidget,
  CheckboxWidget
}

// Registered as a template (not a widget) so every input-based widget that
// delegates to it — text, number, integer, email, url, … — picks up the styling.
export { BaseInputTemplate }
