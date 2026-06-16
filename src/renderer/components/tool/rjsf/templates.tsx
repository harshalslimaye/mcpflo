import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import type {
  ArrayFieldTemplateProps,
  ArrayFieldItemTemplateProps,
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  TemplatesType
} from '@rjsf/utils'
import { BaseInputTemplate } from './widgets'

// Layout templates that give the generated form MCPFlo's spacing and the
// label/description/error treatment the hand-rolled Params form used.

const ICON_BTN =
  'inline-flex items-center justify-center rounded-[6px] border border-border bg-bg-elevated p-[5px] text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40'

// Wraps a single field: label (+ required asterisk), description, control, errors.
// `displayLabel` is false for object/array/boolean fields, which render their own
// title/label, so we skip the label there to avoid duplication.
function FieldTemplate(props: FieldTemplateProps): React.JSX.Element {
  const {
    id,
    classNames,
    style,
    label,
    required,
    rawDescription,
    rawErrors,
    children,
    displayLabel,
    hidden
  } = props
  if (hidden) return <div className="hidden">{children}</div>

  return (
    <div className={`flex flex-col gap-1.5 ${classNames ?? ''}`} style={style}>
      {displayLabel && label && (
        <label htmlFor={id} className="font-mono text-[13px] text-text-primary">
          {label}
          {required && <span className="ml-0.5 text-accent">*</span>}
        </label>
      )}
      {displayLabel && rawDescription && (
        <p className="text-[12px] leading-snug text-fg-faint">{rawDescription}</p>
      )}
      {children}
      {Array.isArray(rawErrors) &&
        rawErrors.map((error) => (
          <p key={error} className="text-xs text-red-400">
            {error}
          </p>
        ))}
    </div>
  )
}

// Renders an object's properties in a vertical stack. The root object is laid
// out flat; nested objects get a title and an indented, bordered group.
function ObjectFieldTemplate(props: ObjectFieldTemplateProps): React.JSX.Element {
  const { title, description, properties, fieldPathId } = props
  const isRoot = fieldPathId.$id === 'root'
  const body = (
    <div className="flex flex-col gap-4">
      {properties.map((p) => (
        <div key={p.name}>{p.content}</div>
      ))}
    </div>
  )

  if (isRoot) return body

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-border-soft bg-panel-2/40 p-3">
      {title && (
        <span className="font-mono text-[12px] font-semibold text-text-primary">{title}</span>
      )}
      {description && <p className="text-[12px] leading-snug text-fg-faint">{description}</p>}
      {body}
    </div>
  )
}

// A single array item: its control plus a small reorder/remove toolbar.
function ArrayFieldItemTemplate(props: ArrayFieldItemTemplateProps): React.JSX.Element {
  const { children, hasToolbar, buttonsProps } = props
  const {
    hasMoveUp,
    hasMoveDown,
    hasRemove,
    onMoveUpItem,
    onMoveDownItem,
    onRemoveItem,
    disabled,
    readonly
  } = buttonsProps
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      {hasToolbar && (
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {hasMoveUp && (
            <button
              type="button"
              className={ICON_BTN}
              aria-label="Move item up"
              disabled={disabled || readonly}
              onClick={onMoveUpItem}
            >
              <ChevronUp size={14} />
            </button>
          )}
          {hasMoveDown && (
            <button
              type="button"
              className={ICON_BTN}
              aria-label="Move item down"
              disabled={disabled || readonly}
              onClick={onMoveDownItem}
            >
              <ChevronDown size={14} />
            </button>
          )}
          {hasRemove && (
            <button
              type="button"
              className={ICON_BTN}
              aria-label="Remove item"
              disabled={disabled || readonly}
              onClick={onRemoveItem}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ArrayFieldTemplate(props: ArrayFieldTemplateProps): React.JSX.Element {
  const { title, items, canAdd, onAddClick, disabled, readonly } = props
  return (
    <div className="flex flex-col gap-2">
      {title && (
        <span className="font-mono text-[12px] font-semibold text-text-primary">{title}</span>
      )}
      {items}
      {canAdd && (
        <button
          type="button"
          className={`${ICON_BTN} w-fit gap-1.5 px-2.5 py-1.5 text-[12px]`}
          aria-label="Add item"
          disabled={disabled || readonly}
          onClick={onAddClick}
        >
          <Plus size={13} />
          Add item
        </button>
      )}
    </div>
  )
}

export const templates: Partial<TemplatesType> = {
  BaseInputTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldItemTemplate
}
