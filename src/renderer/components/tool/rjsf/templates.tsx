import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import type {
  ArrayFieldTemplateProps,
  ArrayFieldItemTemplateProps,
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  RJSFSchema,
  TemplatesType
} from '@rjsf/utils'
import { BaseInputTemplate } from './widgets'
import { HelpIcon } from './HelpIcon'
import { planLayout } from './layout'
import { readTouched } from './touched'

// Layout templates that give the generated form MCPFlo's spacing and the
// label/description/error treatment the hand-rolled Params form used.

const ICON_BTN =
  'inline-flex items-center justify-center rounded-[6px] border border-border bg-bg-elevated p-[5px] text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40'

// Wraps a single field: label (+ required asterisk + help icon), control, errors.
// There is no inline description line — the description lives behind the `i`
// tooltip beside the label. `displayLabel` is false for object/array/boolean
// fields, which render their own title/label, so we skip the label there.
// Width is owned by the parent grid (ObjectFieldTemplate), not here.
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
    hidden,
    registry
  } = props
  if (hidden) return <div className="hidden">{children}</div>

  // Errors stay hidden until the field has been blurred (the widgets mark
  // themselves touched on blur), so an untouched form doesn't light up every
  // required field at once.
  const ctx = readTouched(registry.formContext)
  const showErrors = !ctx || ctx.touched.has(id)

  return (
    <div className={`flex flex-col gap-1.5 ${classNames ?? ''}`} style={style}>
      {displayLabel && label && (
        <div className="flex items-center gap-1.5">
          <label htmlFor={id} className="font-mono text-[13px] text-text-primary">
            {label}
            {required && <span className="ml-0.5 text-accent">*</span>}
          </label>
          <HelpIcon text={rawDescription} />
        </div>
      )}
      {children}
      {showErrors &&
        Array.isArray(rawErrors) &&
        rawErrors.map((error) => (
          <p key={error} className="text-xs text-red-400">
            {error}
          </p>
        ))}
    </div>
  )
}

// Lays an object's properties into the two-column Request grid per the layout
// engine: required scalars pair two-up, full-width fields (textareas, arrays,
// objects, long/unbreakable values) take their own row, and booleans collect
// into a trailing band. Small or all-full-width objects fall back to a single
// stacked column. The root is laid out flat; nested objects keep the bordered
// card and run the same engine one level down.
function ObjectFieldTemplate(props: ObjectFieldTemplateProps): React.JSX.Element {
  const { title, schema, properties, fieldPathId } = props
  const isRoot = fieldPathId.$id === 'root'
  const plan = planLayout(schema as RJSFSchema)

  const contentByName = new Map(properties.map((p) => [p.name, p.content]))
  // Anything RJSF rendered but the planner didn't place (e.g. additionalProperties
  // keys) is appended full-width so no field is silently dropped.
  const placed = new Set([...plan.cells.map((c) => c.name), ...plan.booleans])
  const extras = properties.filter((p) => !placed.has(p.name))

  const body = (
    <div
      className={
        plan.singleColumn ? 'flex flex-col gap-4' : 'grid grid-cols-2 items-start gap-x-4 gap-y-4'
      }
    >
      {plan.cells.map((cell) => (
        <div
          key={cell.name}
          className={plan.singleColumn || cell.width === 'full' ? 'col-span-2' : 'col-span-1'}
        >
          {contentByName.get(cell.name)}
        </div>
      ))}
      {extras.map((p) => (
        <div key={p.name} className="col-span-2">
          {p.content}
        </div>
      ))}
      {plan.booleans.length > 0 && (
        <div className="col-span-2">
          <div
            className={
              plan.singleColumn ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-x-4 gap-y-3'
            }
          >
            {plan.booleans.map((name) => (
              <div key={name}>{contentByName.get(name)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  if (isRoot) return body

  const description = typeof schema.description === 'string' ? schema.description : undefined
  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-border-soft bg-panel-2/40 p-3">
      {title && (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[12px] font-semibold text-text-primary">{title}</span>
          <HelpIcon text={description} />
        </div>
      )}
      {body}
    </div>
  )
}

// The reorder/remove buttons shared by both array-item layouts.
function ItemToolbar({
  buttons,
  children
}: {
  buttons: ArrayFieldItemTemplateProps['buttonsProps']
  children?: React.ReactNode
}): React.JSX.Element {
  const {
    hasMoveUp,
    hasMoveDown,
    hasRemove,
    onMoveUpItem,
    onMoveDownItem,
    onRemoveItem,
    disabled,
    readonly
  } = buttons
  return (
    <div className="flex shrink-0 items-center gap-1">
      {children}
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
  )
}

// A single array item. Scalar items render as a flat row (control + toolbar);
// object items render as a collapsible card with a `name #N` header so the user
// can tell which add/remove controls belong to which level.
function ArrayFieldItemTemplate(props: ArrayFieldItemTemplateProps): React.JSX.Element {
  const { children, hasToolbar, buttonsProps, index, schema } = props
  const [collapsed, setCollapsed] = useState(false)

  const itemType = Array.isArray(schema.type) ? schema.type[0] : schema.type
  const isObject = itemType === 'object'

  if (!isObject) {
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {hasToolbar && <ItemToolbar buttons={buttonsProps} />}
      </div>
    )
  }

  // `name #N` — the path's penultimate segment is the array key, the last is the
  // numeric index.
  const path = buttonsProps.fieldPathId.path
  const arrayName = path.length >= 2 ? String(path[path.length - 2]) : 'item'
  const label = `${arrayName} #${index + 1}`

  return (
    <div className="rounded-[8px] border border-border-soft bg-panel-2/40">
      <div className="flex items-center gap-1 border-b border-border-soft px-3 py-2">
        <span className="font-mono text-[12px] font-semibold text-text-primary">{label}</span>
        <div className="flex-1" />
        {hasToolbar && (
          <ItemToolbar buttons={buttonsProps}>
            <button
              type="button"
              className={ICON_BTN}
              aria-label={collapsed ? 'Expand item' : 'Collapse item'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          </ItemToolbar>
        )}
      </div>
      {!collapsed && <div className="p-3">{children}</div>}
    </div>
  )
}

function ArrayFieldTemplate(props: ArrayFieldTemplateProps): React.JSX.Element {
  const { title, items, canAdd, onAddClick, disabled, readonly, schema, fieldPathId } = props
  const description = typeof schema.description === 'string' ? schema.description : undefined
  const count = items.length
  // Arrays nested below the root get an accent left-border so a sub-array reads
  // as contained within its parent card.
  const nested = fieldPathId.path.length > 1

  return (
    <fieldset
      className={`flex flex-col gap-2 rounded-[8px] border border-border-soft bg-panel-2/40 p-3 ${
        nested ? 'border-l-2 border-l-accent' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {title && (
          <span className="font-mono text-[12px] font-semibold text-text-primary">{title}</span>
        )}
        <span className="text-[11px] text-text-muted">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
        <HelpIcon text={description} />
      </div>
      <div className="flex flex-col gap-2">{items}</div>
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
    </fieldset>
  )
}

export const templates: Partial<TemplatesType> = {
  BaseInputTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldItemTemplate
}
