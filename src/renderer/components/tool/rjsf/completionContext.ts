import type { CompletionRef } from '../../../../shared/mcp.types'

// Completion context for the form. Only wired for a prompt/resource-template
// form on a server that declares the `completions` capability — RjsfForm
// threads this into `formContext` alongside touched-tracking, and
// CompletionWidget reads it to know what to ask for.

export interface CompletionContext {
  serverId: string
  ref: CompletionRef
  // Sibling arg values, read live at request time (a getter, not a snapshot,
  // so the formContext object stays referentially stable across keystrokes —
  // see PromptRequestPanel). `excludeArgName` drops the field being completed
  // itself out of its own context.
  getContextArgs: (excludeArgName: string) => Record<string, string>
}

// Reads the completion context off RJSF's untyped `formContext` — nested
// under a `completion` key, alongside touched-tracking's own top-level
// fields (see PromptRequestPanel's formContext). Returns undefined when it
// isn't wired (the widget then falls back to a plain input — e.g. a
// tool-call form, or a server with no completions support).
export function readCompletion(formContext: unknown): CompletionContext | undefined {
  const outer = formContext as { completion?: Partial<CompletionContext> } | undefined
  const ctx = outer?.completion
  if (
    ctx &&
    typeof ctx.serverId === 'string' &&
    ctx.ref &&
    typeof ctx.getContextArgs === 'function'
  ) {
    return ctx as CompletionContext
  }
  return undefined
}
