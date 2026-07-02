import { useEffect, useMemo, useState } from 'react'
import JsonView from '@uiw/react-json-view'
import { ChevronRight, ChevronDown, Braces, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useServerStore } from '../../stores/serverStore'
import { parseServerConfigJson } from '../../lib/parseServerConfigJson'
import {
  parseTransportUrl,
  credentialOverHttp,
  oauthTokenOverHttp,
  findDuplicateKey,
  duplicateKeyMessage
} from '../../lib/transportValidation'
import { TREE_THEME } from '../shared/json/jsonViewTheme'
import {
  MCP_PROTOCOL_VERSIONS,
  LATEST_MCP_PROTOCOL_VERSION
} from '../../../shared/protocolVersions'
import type { ServerConfig, ServerOverrides, TransportConfig } from '../../../shared/mcp.types'

type TransportType = TransportConfig['type']

interface KeyValue {
  key: string
  value: string
}

interface FormState {
  name: string
  transportType: TransportType
  // stdio
  command: string
  args: string
  env: KeyValue[]
  // streamable-http
  url: string
  headers: KeyValue[]
  // streamable-http OAuth
  auth: 'none' | 'oauth'
  oauthClientId: string
  oauthClientSecret: string
  oauthScope: string
  // advanced
  timeoutMs: string
  // '' = track the SDK's latest revision; a version string pins the request.
  protocolVersion: string
}

const defaults: FormState = {
  name: '',
  transportType: 'stdio',
  command: '',
  args: '',
  env: [],
  url: '',
  headers: [],
  auth: 'none',
  oauthClientId: '',
  oauthClientSecret: '',
  oauthScope: '',
  timeoutMs: '',
  protocolVersion: ''
}

// True when a custom header named "Authorization" is present (case-insensitive).
// In OAuth mode the bearer token is managed by the provider, so a manual
// Authorization header would collide with it.
function hasAuthorizationHeader(rows: KeyValue[]): boolean {
  return rows.some((r) => r.key.trim().toLowerCase() === 'authorization')
}

/** Collapse editor rows into a record, dropping rows with a blank key.
 *  Returns undefined when nothing usable remains, so the transport key is
 *  omitted entirely rather than set to an empty object. */
function rowsToRecord(rows: KeyValue[]): Record<string, string> | undefined {
  const entries = rows.map((r) => [r.key.trim(), r.value.trim()] as const).filter(([k]) => k !== '')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/** Number of rows with a non-blank key — shown as a badge on the collapsed
 *  section header so filled-in data isn't hidden without a visible cue. */
function filledCount(rows: KeyValue[]): number {
  return rows.filter((r) => r.key.trim() !== '').length
}

function buildTransport(form: FormState): TransportConfig {
  if (form.transportType === 'stdio') {
    const args = form.args.trim() ? form.args.trim().split(/\s+/) : undefined
    const env = rowsToRecord(form.env)
    return {
      type: 'stdio',
      command: form.command.trim(),
      ...(args && { args }),
      ...(env && { env })
    }
  }
  const headers = rowsToRecord(form.headers)
  if (form.auth === 'oauth') {
    const clientId = form.oauthClientId.trim()
    const clientSecret = form.oauthClientSecret.trim()
    const scope = form.oauthScope.trim()
    const oauth = {
      ...(clientId && { clientId }),
      ...(clientSecret && { clientSecret }),
      ...(scope && { scope })
    }
    return {
      type: form.transportType,
      url: form.url.trim(),
      ...(headers && { headers }),
      auth: 'oauth',
      // Omit oauth entirely when no field was filled (pure DCR).
      ...(Object.keys(oauth).length > 0 && { oauth })
    }
  }
  return {
    type: form.transportType,
    url: form.url.trim(),
    ...(headers && { headers })
  }
}

/** Builds the overrides object from the Advanced section, or undefined when
 *  every override is left at its default (so the field is omitted entirely
 *  rather than persisted as an empty object). */
function buildOverrides(form: FormState): ServerOverrides | undefined {
  const timeoutMs = form.timeoutMs.trim()
  const overrides: ServerOverrides = {
    ...(timeoutMs && { timeoutMs: Number(timeoutMs) }),
    ...(form.protocolVersion && { protocolVersion: form.protocolVersion })
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {}
  if (!form.name.trim()) errors.name = 'Name is required'

  if (form.transportType === 'stdio') {
    if (!form.command.trim()) errors.command = 'Command is required'
    const dupEnv = findDuplicateKey(
      form.env.map((r) => r.key),
      false
    )
    if (dupEnv) errors.env = duplicateKeyMessage('variable', dupEnv)
  } else {
    const url = form.url.trim()
    let parsedUrl: URL | undefined
    if (!url) {
      errors.url = 'URL is required'
    } else {
      const parsed = parseTransportUrl(url)
      if ('error' in parsed) errors.url = parsed.error
      else parsedUrl = parsed.url
    }
    // OAuth attaches the bearer token to every request itself once signed in, so
    // this must be checked independent of whatever static headers are set (or
    // aren't) — see oauthTokenOverHttp.
    if (parsedUrl && form.auth === 'oauth') {
      const oauthCleartext = oauthTokenOverHttp(parsedUrl)
      if (oauthCleartext) errors.url = oauthCleartext
    }
    // Header errors, first applicable wins: a structural duplicate, then the
    // OAuth-managed Authorization collision, then a credential sent over plain http.
    const dupHeader = findDuplicateKey(
      form.headers.map((r) => r.key),
      true
    )
    if (dupHeader) {
      errors.headers = duplicateKeyMessage('header', dupHeader)
    } else if (form.auth === 'oauth' && hasAuthorizationHeader(form.headers)) {
      errors.headers = 'Authorization is managed by OAuth — remove it from headers.'
    } else if (parsedUrl) {
      const cleartext = credentialOverHttp(
        parsedUrl,
        form.headers.map((r) => r.key)
      )
      if (cleartext) errors.headers = cleartext
    }
  }

  const timeoutMs = form.timeoutMs.trim()
  if (timeoutMs && (!/^\d+$/.test(timeoutMs) || Number(timeoutMs) <= 0)) {
    errors.timeoutMs = 'Timeout must be a positive number'
  }
  return errors
}

interface AddServerModalProps {
  onClose: () => void
}

export function AddServerModal({ onClose }: AddServerModalProps): React.JSX.Element {
  const addServer = useServerStore((s) => s.addServer)
  const servers = useServerStore((s) => s.servers)
  const [mode, setMode] = useState<'manual' | 'json'>('manual')
  const [json, setJson] = useState('')
  const [jsonError, setJsonError] = useState<string | undefined>(undefined)
  const [form, setForm] = useState<FormState>(defaults)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  // null until the availability check resolves; false blocks OAuth mode (tokens
  // can't be encrypted at rest).
  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    window.api.mcp
      .isEncryptionAvailable()
      .then((v) => {
        if (active) setEncryptionAvailable(v)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Live header/env validation cues (mirror authHeaderCollision: shown inline as
  // the user edits; validate() re-derives the same checks to block submit even
  // when the section is collapsed). A duplicate key takes precedence over the
  // credential-over-http warning.
  const isHttp = mode === 'manual' && form.transportType !== 'stdio'
  const headerKeys = form.headers.map((r) => r.key)
  const duplicateHeader = isHttp ? findDuplicateKey(headerKeys, true) : undefined
  const parsedUrl = useMemo(() => {
    const r = parseTransportUrl(form.url.trim())
    return 'url' in r ? r.url : undefined
  }, [form.url])

  // Live OAuth-mode validation cues (independent of the on-submit errors map).
  const isOAuth = mode === 'manual' && form.transportType !== 'stdio' && form.auth === 'oauth'
  const authHeaderCollision = isOAuth && hasAuthorizationHeader(form.headers)
  const oauthBlocked = isOAuth && encryptionAvailable === false
  const oauthOverHttp = isOAuth && parsedUrl ? oauthTokenOverHttp(parsedUrl) : undefined

  const headerIssue = duplicateHeader
    ? duplicateKeyMessage('header', duplicateHeader)
    : isHttp && parsedUrl
      ? credentialOverHttp(parsedUrl, headerKeys)
      : undefined
  const duplicateEnv =
    mode === 'manual' && form.transportType === 'stdio'
      ? findDuplicateKey(
          form.env.map((r) => r.key),
          false
        )
      : undefined

  // Best-effort parse for the live preview tree — independent of the strict
  // parseServerConfigJson validation that runs on submit, so the preview can
  // show structurally-valid-but-not-yet-importable JSON as the user types.
  const jsonPreview = useMemo(() => {
    try {
      const parsed = JSON.parse(json)
      return parsed !== null && typeof parsed === 'object' ? parsed : undefined
    } catch {
      return undefined
    }
  }, [json])

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()

    if (mode === 'json') {
      const result = parseServerConfigJson(json, new Set(servers.map((srv) => srv.name)))
      if (!result.ok) {
        setJsonError(result.error)
        return
      }
      setJsonError(undefined)
      setSubmitting(true)
      try {
        for (const config of result.configs) {
          await addServer(config)
        }
        onClose()
      } catch {
        // addServer already surfaced the failure as a toast; keep the modal
        // open (and the pasted JSON) so the user can correct and retry. Any
        // configs already added before the failure stay added.
      } finally {
        setSubmitting(false)
      }
      return
    }

    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    // OAuth with no OS encryption is blocked (message shown inline + button
    // disabled); guard here too so a race can't slip through.
    if (oauthBlocked) return

    const overrides = buildOverrides(form)
    const config: ServerConfig = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      transport: buildTransport(form),
      ...(overrides && { overrides })
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
          {/* JSON / manual toggle */}
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'manual' ? 'json' : 'manual'))}
            className="flex w-full items-center gap-1.5 text-left text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer"
          >
            {mode === 'manual' && <Braces size={13} className="shrink-0" />}
            {mode === 'manual' ? 'Paste JSON config' : '← Back to form'}
          </button>

          {mode === 'json' ? (
            <>
              <Field label="JSON config" error={jsonError}>
                <textarea
                  aria-label="JSON config"
                  value={json}
                  onChange={(e) => {
                    setJson(e.target.value)
                    setJsonError(undefined)
                  }}
                  rows={8}
                  spellCheck={false}
                  placeholder={
                    '{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "my-mcp-server"]\n    }\n  }\n}'
                  }
                  className="w-full px-3 py-2 rounded border border-border bg-bg-elevated text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-y font-mono"
                />
              </Field>
              {jsonPreview && (
                <div className="max-h-[180px] overflow-y-auto rounded border border-border bg-bg-elevated p-2">
                  <JsonView
                    value={jsonPreview}
                    style={TREE_THEME}
                    displayDataTypes={false}
                    enableClipboard={false}
                    shortenTextAfterLength={0}
                    className="font-mono text-xs leading-relaxed"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {/* Name */}
              <Field label="Name" error={errors.name} required>
                <Input
                  placeholder="My MCP Server"
                  value={form.name}
                  onChange={(v) => set('name', v)}
                  aria-label="Name"
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
                      className={`px-3 py-1 rounded text-xs border transition-colors cursor-pointer ${
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
                      placeholder="-y my-mcp-server"
                      value={form.args}
                      onChange={(v) => set('args', v)}
                      aria-label="Args"
                    />
                  </Field>
                  <CollapsibleSection
                    label="Environment Variables"
                    hint="Optional"
                    count={filledCount(form.env)}
                  >
                    <KeyValueEditor
                      rows={form.env}
                      onChange={(v) => set('env', v)}
                      keyPlaceholder="API_KEY"
                      valuePlaceholder="your-secret"
                      ariaPrefix="Environment Variables"
                      addLabel="Add variable"
                      secret
                    />
                  </CollapsibleSection>
                  {duplicateEnv && (
                    <p className="text-xs text-red-400">
                      {duplicateKeyMessage('variable', duplicateEnv)}
                    </p>
                  )}
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

                  {/* Auth mode */}
                  <Field label="Auth">
                    <div className="flex gap-2">
                      {(['none', 'oauth'] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => set('auth', a)}
                          className={`px-3 py-1 rounded text-xs border transition-colors cursor-pointer ${
                            form.auth === a
                              ? 'border-accent text-accent bg-accent/10'
                              : 'border-border text-text-muted hover:text-text-primary'
                          }`}
                        >
                          {a === 'none' ? 'None' : 'OAuth'}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {form.auth === 'oauth' && (
                    <>
                      {oauthBlocked && (
                        <p className="text-xs text-red-400">
                          OAuth tokens require OS-level encryption, which is not available on this
                          system. Use a static token instead.
                        </p>
                      )}
                      {oauthOverHttp && <p className="text-xs text-red-400">{oauthOverHttp}</p>}
                      <Field label="Client ID" hint="Optional">
                        <Input
                          placeholder="Leave blank to auto-register"
                          value={form.oauthClientId}
                          onChange={(v) => set('oauthClientId', v)}
                          aria-label="Client ID"
                        />
                      </Field>
                      <Field label="Client Secret" hint="Optional">
                        <SecretInput
                          value={form.oauthClientSecret}
                          onChange={(v) => set('oauthClientSecret', v)}
                          aria-label="Client Secret"
                        />
                      </Field>
                      <Field label="Scope" hint="Optional">
                        <Input
                          placeholder="e.g. read:tools write:resources"
                          value={form.oauthScope}
                          onChange={(v) => set('oauthScope', v)}
                          aria-label="Scope"
                        />
                      </Field>
                      {authHeaderCollision && (
                        <p className="text-xs text-red-400">
                          Authorization is managed by OAuth — remove it from headers.
                        </p>
                      )}
                    </>
                  )}

                  <CollapsibleSection
                    label="Headers"
                    hint="Optional"
                    count={filledCount(form.headers)}
                  >
                    <KeyValueEditor
                      rows={form.headers}
                      onChange={(v) => set('headers', v)}
                      keyPlaceholder="Authorization"
                      valuePlaceholder="Bearer token"
                      ariaPrefix="Header"
                      addLabel="Add header"
                      secret
                    />
                  </CollapsibleSection>
                  {headerIssue && <p className="text-xs text-red-400">{headerIssue}</p>}
                </>
              )}

              <CollapsibleSection
                label="Advanced"
                hint="Optional"
                count={(form.timeoutMs.trim() ? 1 : 0) + (form.protocolVersion ? 1 : 0)}
              >
                <Field label="Protocol version" hint="Requested at connect">
                  <Select
                    value={form.protocolVersion}
                    onChange={(v) => set('protocolVersion', v)}
                    aria-label="Protocol version"
                  >
                    <option value="">Latest ({LATEST_MCP_PROTOCOL_VERSION})</option>
                    {MCP_PROTOCOL_VERSIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Connection timeout" hint="ms" error={errors.timeoutMs}>
                  <Input
                    type="number"
                    placeholder="60000"
                    value={form.timeoutMs}
                    onChange={(v) => set('timeoutMs', v)}
                    aria-label="Connection timeout"
                  />
                </Field>
              </CollapsibleSection>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-sm text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || oauthBlocked}
              className="px-3 py-1.5 rounded text-sm bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-default"
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

/** Collapsed-by-default section for optional, bulky inputs (env vars,
 *  headers) — a toggleable header with a count badge so already-entered
 *  rows stay visible even while the editor itself is hidden. */
function CollapsibleSection({
  label,
  hint,
  count,
  children
}: {
  label: string
  hint?: string
  count: number
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className="flex w-full items-center gap-1 text-left cursor-pointer"
      >
        <Chevron size={12} className="shrink-0 text-text-muted" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-muted">
          {label}
        </span>
        {hint && <span className="text-[10px] text-text-muted opacity-60">({hint})</span>}
        {count > 0 && (
          <span className="rounded-full border border-border-soft bg-bg-elevated px-[7px] py-px text-[10px] text-text-muted">
            {count}
          </span>
        )}
      </button>
      {open && children}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  'aria-label': ariaLabel
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'number'
  'aria-label': string
}): React.JSX.Element {
  return (
    <input
      type={type}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-1.5 rounded border border-border bg-bg-elevated text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
    />
  )
}

// A native select styled to match Input — for small fixed choice lists like the
// protocol version.
function Select({
  value,
  onChange,
  children,
  'aria-label': ariaLabel
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  'aria-label': string
}): React.JSX.Element {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-1.5 rounded border border-border bg-bg-elevated text-text-primary text-sm focus:outline-none focus:border-accent transition-colors cursor-pointer"
    >
      {children}
    </select>
  )
}

// A single-line masked input with a reveal toggle — for OAuth client secrets,
// mirroring the masking pattern the key/value editor uses for header/env values.
function SecretInput({
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
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="relative">
      <input
        type={revealed ? 'text' : 'password'}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="w-full px-3 py-1.5 pr-9 rounded border border-border bg-bg-elevated text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? 'Hide value' : 'Show value'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-fg-faint hover:text-text-primary transition-colors cursor-pointer"
      >
        {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  )
}

// ── Key/value editor ──────────────────────────────────────────────────────────
// A small "table" of key/value rows used for both HTTP headers and stdio env
// vars. Replaces a freeform KEY=VALUE textarea: no syntax to learn, secret
// values are masked with a per-row reveal toggle, and the row list is its own
// scroll container — it caps at ~2 rows then scrolls internally, so the modal
// itself never grows.

const GRID_COLS = 'grid grid-cols-[1fr_1fr_2rem]'

function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  ariaPrefix,
  addLabel,
  secret = false
}: {
  rows: KeyValue[]
  onChange: (rows: KeyValue[]) => void
  keyPlaceholder: string
  valuePlaceholder: string
  /** Singular noun for row aria-labels, e.g. "Header" → "Header 1 key". */
  ariaPrefix: string
  addLabel: string
  /** Mask value inputs and show a reveal toggle (tokens, bearer secrets…). */
  secret?: boolean
}): React.JSX.Element {
  const update = (i: number, patch: Partial<KeyValue>): void =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i: number): void => onChange(rows.filter((_, idx) => idx !== i))
  const add = (): void => onChange([...rows, { key: '', value: '' }])

  return (
    <div className="rounded-md border border-border bg-bg-elevated overflow-hidden">
      {rows.length > 0 && (
        // The scroll boundary: caps height, then scrolls. scrollbar-gutter keeps
        // columns from shifting when the bar appears. The header lives inside so
        // it shares the viewport width (stays aligned) and sticks while scrolling.
        <div className="max-h-[104px] overflow-y-auto [scrollbar-gutter:stable]">
          <div
            className={`${GRID_COLS} sticky top-0 z-10 bg-bg-elevated border-b border-border text-[10px] uppercase tracking-wider text-fg-faint`}
          >
            <span className="px-2.5 py-1.5">Key</span>
            <span className="px-2.5 py-1.5 border-l border-border">Value</span>
            <span className="border-l border-border" />
          </div>
          {rows.map((row, i) => (
            <KeyValueRow
              key={i}
              row={row}
              index={i}
              ariaPrefix={ariaPrefix}
              keyPlaceholder={keyPlaceholder}
              valuePlaceholder={valuePlaceholder}
              secret={secret}
              onChange={(patch) => update(i, patch)}
              onRemove={() => remove(i)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className={`w-full flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs text-accent hover:bg-accent-soft transition-colors cursor-pointer ${
          rows.length > 0 ? 'border-t border-border' : ''
        }`}
      >
        <Plus size={13} />
        {addLabel}
      </button>
    </div>
  )
}

function KeyValueRow({
  row,
  index,
  ariaPrefix,
  keyPlaceholder,
  valuePlaceholder,
  secret,
  onChange,
  onRemove
}: {
  row: KeyValue
  index: number
  ariaPrefix: string
  keyPlaceholder: string
  valuePlaceholder: string
  secret: boolean
  onChange: (patch: Partial<KeyValue>) => void
  onRemove: () => void
}): React.JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const n = index + 1
  const cell =
    'min-w-0 bg-transparent px-2.5 py-1.5 text-sm text-text-primary placeholder:text-fg-faint focus:bg-accent-soft focus:outline-none font-mono'

  return (
    <div className={`${GRID_COLS} items-stretch border-b border-border last:border-b-0`}>
      <input
        type="text"
        aria-label={`${ariaPrefix} ${n} key`}
        value={row.key}
        onChange={(e) => onChange({ key: e.target.value })}
        placeholder={keyPlaceholder}
        spellCheck={false}
        autoComplete="off"
        className={cell}
      />
      <div className="relative border-l border-border">
        <input
          type={secret && !revealed ? 'password' : 'text'}
          aria-label={`${ariaPrefix} ${n} value`}
          value={row.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={valuePlaceholder}
          spellCheck={false}
          autoComplete="off"
          className={`w-full ${cell} ${secret ? 'pr-7' : ''}`}
        />
        {secret && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide value' : 'Show value'}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-fg-faint hover:text-text-primary transition-colors cursor-pointer"
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${ariaPrefix.toLowerCase()} ${n}`}
        className="flex items-center justify-center border-l border-border text-fg-faint hover:text-accent hover:bg-accent-soft transition-colors cursor-pointer"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
