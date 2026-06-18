import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { useServerStore } from '../../stores/serverStore'
import type { ServerConfig, TransportConfig } from '../../../shared/mcp.types'

type TransportType = TransportConfig['type']

interface FormState {
  name: string
  description: string
  transportType: TransportType
  // stdio
  command: string
  args: string
  env: string
  // streamable-http
  url: string
  headers: string
}

const defaults: FormState = {
  name: '',
  description: '',
  transportType: 'stdio',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: ''
}

function parseKeyValue(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('='))
      .map((l) => {
        const idx = l.indexOf('=')
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
      })
  )
}

function buildTransport(form: FormState): TransportConfig {
  if (form.transportType === 'stdio') {
    const args = form.args.trim() ? form.args.trim().split(/\s+/) : undefined
    const env = form.env.trim() ? parseKeyValue(form.env) : undefined
    return {
      type: 'stdio',
      command: form.command.trim(),
      ...(args && { args }),
      ...(env && { env })
    }
  }
  const headers = form.headers.trim() ? parseKeyValue(form.headers) : undefined
  return {
    type: form.transportType,
    url: form.url.trim(),
    ...(headers && { headers })
  }
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (form.transportType === 'stdio' && !form.command.trim()) errors.command = 'Command is required'
  if (form.transportType !== 'stdio' && !form.url.trim()) errors.url = 'URL is required'
  return errors
}

interface AddServerModalProps {
  onClose: () => void
}

export function AddServerModal({ onClose }: AddServerModalProps): React.JSX.Element {
  const addServer = useServerStore((s) => s.addServer)
  const [form, setForm] = useState<FormState>(defaults)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    const config: ServerConfig = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      ...(form.description.trim() && { description: form.description.trim() }),
      transport: buildTransport(form)
    }

    setSubmitting(true)
    try {
      await addServer(config)
      onClose()
    } catch {
      // addServer already surfaced the failure as a toast; keep the modal open
      // (and its entered values) so the user can correct and retry.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Add MCP Server" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-4">
          {/* Name */}
          <Field label="Name" error={errors.name} required>
            <Input
              placeholder="GitHub MCP"
              value={form.name}
              onChange={(v) => set('name', v)}
              aria-label="Name"
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <Input
              placeholder="Optional"
              value={form.description}
              onChange={(v) => set('description', v)}
              aria-label="Description"
            />
          </Field>

          {/* Transport type */}
          <Field label="Transport">
            <div className="flex gap-2">
              {(['stdio', 'streamable-http'] as TransportType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('transportType', t)}
                  className={`px-3 py-1 rounded text-xs border transition-colors ${
                    form.transportType === t
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          {/* stdio fields */}
          {form.transportType === 'stdio' && (
            <>
              <Field label="Command" error={errors.command} required>
                <Input
                  placeholder="npx"
                  value={form.command}
                  onChange={(v) => set('command', v)}
                  aria-label="Command"
                />
              </Field>
              <Field label="Args" hint="Space-separated">
                <Input
                  placeholder="-y @modelcontextprotocol/server-github"
                  value={form.args}
                  onChange={(v) => set('args', v)}
                  aria-label="Args"
                />
              </Field>
              <Field label="Env vars" hint="One KEY=VALUE per line">
                <Textarea
                  placeholder={'GITHUB_TOKEN=ghp_xxx\nANOTHER=value'}
                  value={form.env}
                  onChange={(v) => set('env', v)}
                  aria-label="Env vars"
                />
              </Field>
            </>
          )}

          {/* streamable-http fields */}
          {form.transportType !== 'stdio' && (
            <>
              <Field label="URL" error={errors.url} required>
                <Input
                  placeholder="https://mcp.example.com/mcp"
                  value={form.url}
                  onChange={(v) => set('url', v)}
                  aria-label="URL"
                />
              </Field>
              <Field label="Headers" hint="One KEY=VALUE per line">
                <Textarea
                  placeholder={'Authorization=Bearer token'}
                  value={form.headers}
                  onChange={(v) => set('headers', v)}
                  aria-label="Headers"
                />
              </Field>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-sm text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded text-sm bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add Server'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ── Small local primitives ────────────────────────────────────────────────────

function Field({
  label,
  error,
  hint,
  required,
  children
}: {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-text-muted">
        {label}
        {required && <span className="text-accent ml-0.5">*</span>}
        {hint && <span className="ml-1 text-text-muted opacity-60">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  'aria-label': string
}): React.JSX.Element {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-1.5 rounded border border-border bg-bg-elevated text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
    />
  )
}

function Textarea({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  'aria-label': string
}): React.JSX.Element {
  return (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full px-3 py-1.5 rounded border border-border bg-bg-elevated text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none font-mono"
    />
  )
}
