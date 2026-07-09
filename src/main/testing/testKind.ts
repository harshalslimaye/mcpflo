import type { TestKind } from '../../shared/testing.types'

// `TestKind` is a compile-time-only type — IPC messages are plain JSON at
// runtime, so nothing stops a caller sending some other string as `kind`.
// Every handler that turns `kind` into a filesystem path (via scriptStore)
// must reject anything but the three real values here, before it reaches
// safeJoin — same trust-boundary rationale as assertValidServerId for ids.
const VALID_KINDS: readonly string[] = ['tool', 'prompt', 'resource'] satisfies TestKind[]

export function assertValidTestKind(kind: string): asserts kind is TestKind {
  if (typeof kind !== 'string' || !VALID_KINDS.includes(kind)) {
    throw new Error(`Invalid test kind: ${JSON.stringify(kind)}`)
  }
}
