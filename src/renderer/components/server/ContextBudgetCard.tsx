import { useMemo } from 'react'
import { Info } from 'lucide-react'
import type { MCPServer } from '../../../shared/mcp.types'
import { computeContextBudget, CONTEXT_WINDOW_TOKENS } from '../../lib/contextBudget'
import { Tooltip } from '../ui/Tooltip'

interface ContextBudgetCardProps {
  server: MCPServer
}

type CategoryKey = 'tools' | 'resources' | 'prompts'

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'tools', label: 'Tools' },
  { key: 'resources', label: 'Resources' },
  { key: 'prompts', label: 'Prompts' }
]

// The bar/dots use one accent hue at decreasing opacity per category — this is
// one server's own capability mix, not a multi-server comparison, so distinct
// hues would imply a meaning (e.g. status) that isn't there.
const CATEGORY_OPACITY: Record<CategoryKey, string> = {
  tools: 'opacity-100',
  resources: 'opacity-70',
  prompts: 'opacity-45'
}

function formatTokens(tokens: number): string {
  return `~${Math.round(tokens).toLocaleString()}`
}

function formatPercent(fraction: number, digits: 0 | 2 = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`
}

const WINDOW_TOKENS_K = CONTEXT_WINDOW_TOKENS / 1000

// A server's estimated capability-token cost, broken down by category. Hidden
// entirely when the server has no capabilities at all — an empty card (zero
// bar, zero table) would be visual noise with nothing to communicate.
export function ContextBudgetCard({ server }: ContextBudgetCardProps): React.JSX.Element | null {
  const { tools, resources, prompts } = server
  const budget = useMemo(
    () => computeContextBudget({ tools, resources, prompts }),
    [tools, resources, prompts]
  )

  if (budget.total.count === 0) return null

  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-bg-surface">
      <div className="flex items-center gap-3 border-b border-border bg-panel-2 px-4 py-[11px]">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
          Context budget
        </span>
        <Tooltip label="Estimated. Actual usage varies by model tokenizer — this is a heuristic count of what loading every capability would add to context.">
          <Info size={12} className="text-fg-faint" />
        </Tooltip>
        <div className="flex-1" />
        <span className="text-[13px]">
          <span className="font-semibold text-text-primary">
            {formatTokens(budget.total.tokens)}
          </span>{' '}
          <span className="text-text-muted">tokens</span>
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
          {CATEGORIES.map(({ key, label }) => {
            const cat = budget[key]
            if (cat.fractionOfTotal <= 0) return null
            return (
              <Tooltip
                key={key}
                side="top"
                label={`${label} — ${formatTokens(cat.tokens)} tokens (${formatPercent(cat.fractionOfTotal)} of total)`}
              >
                <div
                  className={`h-full cursor-pointer bg-accent transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[inset_0_0_0_1.5px_var(--accent-line)] ${CATEGORY_OPACITY[key]}`}
                  style={{ width: `${cat.fractionOfTotal * 100}%` }}
                />
              </Tooltip>
            )
          })}
        </div>

        <div className="flex flex-col">
          <div className="grid grid-cols-[1fr_56px_64px_100px] gap-2 border-b border-border-soft pb-2 text-[11px] uppercase tracking-wide text-fg-faint">
            <span>Capability</span>
            <span className="text-right">Items</span>
            <span className="text-right">Avg</span>
            <span className="text-right">Tokens</span>
          </div>

          {CATEGORIES.map(({ key, label }) => {
            const cat = budget[key]
            return (
              <div
                key={key}
                className="grid grid-cols-[1fr_56px_64px_100px] items-center gap-2 border-b border-border-soft py-2 text-[13px]"
              >
                <span className="flex items-center gap-2 text-text-primary">
                  <span
                    className={`h-[7px] w-[7px] shrink-0 rounded-full bg-accent ${CATEGORY_OPACITY[key]}`}
                  />
                  {label}
                </span>
                <span className="text-right text-text-muted">{cat.count}</span>
                <span className="text-right text-text-muted">
                  {cat.count === 0 ? '—' : `~${cat.avg}`}
                </span>
                <span className="text-right">
                  <div className="text-text-primary">{formatTokens(cat.tokens)}</div>
                  <div className="text-[11px] text-fg-faint">
                    {formatPercent(cat.fractionOfTotal)} of total
                  </div>
                </span>
              </div>
            )
          })}

          <div className="grid grid-cols-[1fr_56px_64px_100px] items-center gap-2 py-2 text-[13px] font-semibold">
            <span className="text-text-primary">Total</span>
            <span className="text-right text-text-primary">{budget.total.count}</span>
            <span className="text-right text-text-primary">~{budget.total.avg}</span>
            <span className="text-right">
              <div className="text-text-primary">{formatTokens(budget.total.tokens)}</div>
              <div className="text-[11px] font-normal text-fg-faint">100%</div>
            </span>
          </div>
        </div>

        <div className="border-t border-border-soft pt-3">
          <div className="flex items-baseline justify-between gap-2.5 text-[12.5px] text-text-muted">
            <span>
              Footprint in a{' '}
              <strong className="font-semibold text-text-primary">{WINDOW_TOKENS_K}K-token</strong>{' '}
              context window
            </span>
            <span className="shrink-0 font-semibold text-text-primary">
              {formatPercent(budget.windowFraction, 2)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-border-soft bg-bg-elevated">
            <div
              className="h-full min-w-[2px] rounded-full bg-accent"
              style={{ width: `${budget.windowFraction * 100}%` }}
            />
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-[11.5px] leading-[1.5] text-fg-faint">
          <Info size={12} className="mt-px shrink-0" />
          <span>
            <strong className="text-text-muted">~ Estimated</strong> if all capabilities were loaded
            at once. Actual token usage varies by the model&rsquo;s tokenizer and which capabilities
            the agent actually pulls in; the {WINDOW_TOKENS_K}K window is a reference point.
          </span>
        </p>
      </div>
    </div>
  )
}
