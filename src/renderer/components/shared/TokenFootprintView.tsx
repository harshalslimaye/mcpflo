import { Search } from 'lucide-react'
import {
  REFERENCE_MODELS,
  TOKENIZER_LABEL,
  computeResponseFootprint,
  type FootprintStatus,
  type ModelFootprint
} from '../../lib/contextBudget'

interface TokenFootprintViewProps {
  // "Response footprint" for a call's result, "Definition footprint" for a
  // tool/prompt's own schema — the rest of the visualization is identical.
  title: string
  // What the legend calls the thing being measured ("response", "definition").
  subjectNoun?: string
  tokens: number
  characters: number
  rawBytes: number
  // Content blocks excluded from the estimate (image/audio/blob) — only
  // meaningful for call responses; a schema never has any.
  binaryBlocks?: number
}

interface StatusMeta {
  label: string
  dot: string
  text: string
  fill: string
  // Border/background pairing for the magnified-callout card.
  callout: string
}

const STATUS_META: Record<FootprintStatus, StatusMeta> = {
  safe: {
    label: 'Safe',
    dot: 'bg-green',
    text: 'text-green',
    fill: 'bg-green',
    callout: 'border-green/40 bg-green-soft'
  },
  caution: {
    label: 'Caution',
    dot: 'bg-yellow-400',
    text: 'text-yellow-500',
    fill: 'bg-yellow-400',
    callout: 'border-yellow-500/40 bg-yellow-500/10'
  },
  danger: {
    label: 'Danger',
    dot: 'bg-red-500',
    text: 'text-red-500',
    fill: 'bg-red-500',
    callout: 'border-red-500/40 bg-red-500/10'
  }
}

// A model's bar would render as an illegible sliver once its own window is
// this small a share of the widest reference window — at that point the
// shared-scale box isn't useful, so we add a separately-scaled magnified view
// instead of just drawing a box too thin to read.
const MAGNIFY_THRESHOLD_SHARE = 0.05

function formatTokens(tokens: number): string {
  return `~${Math.round(tokens).toLocaleString()}`
}

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

// "1,000,000" -> "1M", "200,000" -> "200K" — matches how these reference
// windows are commonly referred to, rather than spelling out every digit.
function formatWindowLabel(tokens: number): string {
  if (tokens % 1_000_000 === 0) return `${tokens / 1_000_000}M`
  if (tokens % 1_000 === 0) return `${tokens / 1_000}K`
  return tokens.toLocaleString()
}

function formatBytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// Renders a token count against every reference model's context window: a
// status badge, the headline number, a deterministic caption, size/character/
// tokenizer stats, per-model bars on a shared scale with true-scale fill, a
// magnified callout for any model too small to read at that scale, and a
// legend. Used for both a call's response and a capability's own schema cost
// — the visualization doesn't care which produced the number.
export function TokenFootprintView({
  title,
  subjectNoun = 'response',
  tokens,
  characters,
  rawBytes,
  binaryBlocks = 0
}: TokenFootprintViewProps): React.JSX.Element {
  const footprint = computeResponseFootprint(tokens)

  const maxWindowTokens = Math.max(...REFERENCE_MODELS.map((m) => m.windowTokens))

  const minEntry = footprint.models.reduce((a, b) => (b.fraction < a.fraction ? b : a))
  const maxEntry = footprint.models.reduce((a, b) => (b.fraction > a.fraction ? b : a))
  const overall = STATUS_META[footprint.status]

  const magnified = footprint.models.filter(
    (m) => m.windowTokens / maxWindowTokens < MAGNIFY_THRESHOLD_SHARE
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
              {title}
            </span>
            <span
              aria-label={`Overall footprint status: ${overall.label}`}
              className={`inline-flex items-center gap-1.5 rounded-full border border-border-soft px-2 py-0.5 text-[11px] font-medium ${overall.text}`}
            >
              <span className={`h-[6px] w-[6px] rounded-full ${overall.dot}`} />
              {overall.label}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] font-bold leading-none text-accent">
              {Math.round(tokens).toLocaleString()}
            </span>
            <span className="text-[13px] text-text-muted">tokens</span>
          </div>
          <p
            aria-label="Footprint summary"
            className="max-w-[56ch] text-[12.5px] leading-[1.5] text-text-muted"
          >
            Uses {formatPercent(minEntry.fraction)} of {minEntry.name}&rsquo;s{' '}
            {formatWindowLabel(minEntry.windowTokens)} window, up to{' '}
            {formatPercent(maxEntry.fraction)} of {maxEntry.name}&rsquo;s{' '}
            {formatWindowLabel(maxEntry.windowTokens)} window.
            {binaryBlocks > 0 && (
              <>
                {' '}
                <span className="text-fg-faint">
                  + {binaryBlocks} binary block{binaryBlocks === 1 ? '' : 's'} (not estimated).
                </span>
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <Stat label="Raw size" value={formatBytes(rawBytes)} />
          <Stat label="Characters" value={characters.toLocaleString()} />
          <Stat label="Tokenizer" value={TOKENIZER_LABEL} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
            Context impact
          </span>
          <span className="text-[11px] text-fg-faint">
            Every window drawn on{' '}
            <strong className="font-semibold text-text-muted">one shared scale</strong> — relative
            to a {formatWindowLabel(maxWindowTokens)}-token max
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {footprint.models.map((model) => (
            <ModelRow key={model.name} model={model} maxWindowTokens={maxWindowTokens} />
          ))}
        </div>

        {magnified.map((model) => (
          <MagnifiedRow key={model.name} model={model} tokens={tokens} />
        ))}

        <div className="flex flex-wrap items-center gap-4 border-t border-border-soft pt-2.5 text-[11px] text-fg-faint">
          <LegendDot status="safe" note="<5%" />
          <LegendDot status="caution" note="5–20%" />
          <LegendDot status="danger" note=">20%" />
          <span className="ml-auto">
            solid segment = this {formatTokens(tokens)}-token {subjectNoun}, drawn at true scale in
            every window
          </span>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-wide text-fg-faint">{label}</span>
      <span className="text-[12.5px] font-medium text-text-primary">{value}</span>
    </div>
  )
}

function ModelRow({
  model,
  maxWindowTokens
}: {
  model: ModelFootprint
  maxWindowTokens: number
}): React.JSX.Element {
  const meta = STATUS_META[model.status]
  const boxShare = Math.max((model.windowTokens / maxWindowTokens) * 100, 1.5)
  const fillShare = Math.min(model.fraction, 1) * 100

  return (
    <div className="grid grid-cols-[152px_1fr_72px] items-center gap-3">
      <div className="min-w-0">
        <div className="truncate font-mono text-[12.5px] text-text-primary">{model.name}</div>
        <div className="text-[11px] text-fg-faint">
          {formatWindowLabel(model.windowTokens)} context window
        </div>
      </div>

      <div
        className="h-[18px] rounded-[4px] border border-border-soft bg-bg-elevated"
        style={{ width: `${boxShare}%` }}
      >
        <div className={`h-full rounded-[3px] ${meta.fill}`} style={{ width: `${fillShare}%` }} />
      </div>

      <div className="text-right">
        <div className={`text-[12.5px] font-semibold ${meta.text}`}>
          {formatPercent(model.fraction)}
        </div>
        <div className="text-[10px] text-fg-faint">used</div>
      </div>
    </div>
  )
}

function MagnifiedRow({
  model,
  tokens
}: {
  model: ModelFootprint
  tokens: number
}): React.JSX.Element {
  const meta = STATUS_META[model.status]
  const magnification = Math.floor(
    Math.max(...REFERENCE_MODELS.map((m) => m.windowTokens)) / model.windowTokens
  )
  const fillShare = Math.min(model.fraction, 1) * 100
  const remaining = Math.max(model.windowTokens - tokens, 0)

  return (
    <div className={`flex flex-col gap-2 rounded-[8px] border p-3 ${meta.text} ${meta.callout}`}>
      <div className="flex items-start gap-2">
        <Search size={13} className="mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[11.5px] font-semibold">
            {formatWindowLabel(model.windowTokens)} window, magnified {magnification}×
          </span>
          <p className="text-[11.5px] leading-[1.5] text-text-muted">
            The bar above is too small to read at this scale. Here&rsquo;s that window&rsquo;s own
            scale blown up so the usage is legible.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className={`font-medium ${meta.text}`}>
          {Math.round(tokens).toLocaleString()} tokens
        </span>
        <span className="text-fg-faint">{remaining.toLocaleString()} left</span>
      </div>

      <div className="h-6 overflow-hidden rounded-[5px] border border-border-soft bg-bg-elevated">
        <div className={`h-full ${meta.fill}`} style={{ width: `${fillShare}%` }} />
      </div>

      <div className="flex justify-between text-[10px] text-fg-faint">
        <span>0</span>
        <span>{model.windowTokens.toLocaleString()} tokens</span>
      </div>
    </div>
  )
}

function LegendDot({ status, note }: { status: FootprintStatus; note: string }): React.JSX.Element {
  const meta = STATUS_META[status]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-[6px] w-[6px] rounded-full ${meta.dot}`} />
      {meta.label} <span className="text-fg-faint">{note}</span>
    </span>
  )
}
