import { useMemo, useState } from 'react'
import type { ElicitationRequestEvent, ElicitationResult } from '../../../shared/mcp.types'
import { Modal } from '../ui/Modal'
import { FieldRow, FieldInput } from '../tool/SchemaFields'
import { useServerStore } from '../../stores/serverStore'
import {
  analyzeSchema,
  assembleParams,
  initialFormValues,
  type FormValues
} from '../../lib/toolSchema'

interface ElicitationModalProps {
  request: ElicitationRequestEvent
}

function parseJsonObject(
  text: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a JSON object' }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}

// A server's mid-call request for user input (elicitation/create). Renders the
// requested schema as a form; the rare schema with non-primitive properties
// falls back to a raw-JSON textarea, mirroring the Params tab.
export function ElicitationModal({ request }: ElicitationModalProps): React.JSX.Element {
  const respondToElicitation = useServerStore((s) => s.respondToElicitation)

  const analysis = useMemo(
    () => analyzeSchema(request.params.requestedSchema),
    [request.params.requestedSchema]
  )
  const { fields, hasNonPrimitive, isEmpty } = analysis

  const [values, setValues] = useState<FormValues>(() => initialFormValues(fields))
  const [jsonText, setJsonText] = useState('{}')
  const [submitting, setSubmitting] = useState(false)

  const { params, errors } = useMemo(() => assembleParams(fields, values), [fields, values])
  const jsonParse = useMemo(() => parseJsonObject(jsonText), [jsonText])

  const acceptDisabled =
    submitting || (hasNonPrimitive ? !jsonParse.ok : Object.keys(errors).length > 0)

  async function respond(result: ElicitationResult): Promise<void> {
    if (submitting) return
    setSubmitting(true)
    try {
      // respondToElicitation always settles the request (it dismisses locally
      // even on failure), so on success this modal unmounts. The finally guards
      // the case where the reply rejects, so the buttons don't stay disabled.
      await respondToElicitation(request.elicitationId, result)
    } finally {
      setSubmitting(false)
    }
  }

  function handleAccept(): void {
    const content = hasNonPrimitive ? (jsonParse.ok ? jsonParse.value : {}) : params
    void respond({ action: 'accept', content })
  }

  return (
    <Modal title="Server request" onClose={() => void respond({ action: 'cancel' })}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-muted font-mono">
          {request.serverName} · during {request.toolName}
        </p>

        <p className="text-sm text-text-primary leading-snug">{request.params.message}</p>

        {!isEmpty &&
          (hasNonPrimitive ? (
            <div className="flex flex-col gap-1">
              <textarea
                aria-label="Response JSON"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full px-3 py-2 rounded border border-border bg-bg-elevated text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-y font-mono"
              />
              {!jsonParse.ok && <p className="text-xs text-red-400">{jsonParse.error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {fields.map((field) => (
                <FieldRow key={field.name} field={field}>
                  <FieldInput
                    field={field}
                    value={values[field.name]}
                    onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
                  />
                  {errors[field.name] && (
                    <p className="text-xs text-red-400">{errors[field.name]}</p>
                  )}
                </FieldRow>
              ))}
            </div>
          ))}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => void respond({ action: 'cancel' })}
            disabled={submitting}
            className="px-4 py-1.5 rounded text-sm text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void respond({ action: 'decline' })}
            disabled={submitting}
            className="px-4 py-1.5 rounded text-sm border border-border text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={acceptDisabled}
            className="px-4 py-1.5 rounded text-sm bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Accept
          </button>
        </div>
      </div>
    </Modal>
  )
}
