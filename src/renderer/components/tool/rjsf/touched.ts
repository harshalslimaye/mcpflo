// Touched-field tracking for the form. RJSF validates the whole form live, which
// would flash a "required" error on every empty field before the user has even
// reached it. We instead surface a field's errors only once it's been blurred —
// the panel owns the touched Set and threads this context into the form.

export interface TouchedContext {
  touched: Set<string>
  markTouched: (id: string) => void
}

// Reads the touched context off RJSF's untyped `formContext`, returning undefined
// when it isn't wired (templates then fall back to showing all errors).
export function readTouched(formContext: unknown): TouchedContext | undefined {
  const ctx = formContext as Partial<TouchedContext> | undefined
  if (ctx && ctx.touched instanceof Set && typeof ctx.markTouched === 'function') {
    return ctx as TouchedContext
  }
  return undefined
}
