import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
  Scope,
  type QuickJSWASMModule
} from 'quickjs-emscripten-core'
import variant from '@jitl/quickjs-singlefile-cjs-release-sync'
import chaiSource from 'chai/chai.js?raw'
import bootstrapSource from './bootstrap.js?raw'
import type { ScriptError } from '../../shared/testing.types'

// Compiling the WASM module is the expensive part of standing up a sandbox;
// do it once and share the compiled module across every run. A fresh
// runtime + context is still created per call in evaluateInSandbox() below —
// only the compiled WASM itself is cached here.
let modulePromise: Promise<QuickJSWASMModule> | undefined

function loadModule(): Promise<QuickJSWASMModule> {
  if (!modulePromise) modulePromise = newQuickJSWASMModuleFromVariant(variant)
  return modulePromise
}

const MEMORY_LIMIT_BYTES = 128 * 1024 * 1024
const MAX_STACK_SIZE_BYTES = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 5000

export interface SandboxOutcome {
  // The JSON string __MCPFLO_COLLECT__ returned, when collection succeeded —
  // present even alongside a `scriptError`, since whatever test() calls ran
  // before a mid-script failure already recorded results (verified: a runtime
  // error or an interrupt-triggered timeout partway through a script still
  // leaves the earlier results collectible afterward).
  collectedJson?: string
  // Set when the user script didn't run to completion.
  scriptError?: ScriptError
}

// Maps a thrown error from evaluating the user's script to a ScriptError.
// The name/message pairs below are QuickJS's actual behavior, confirmed
// empirically against this exact package version (not documented in its
// types): a genuine parse failure throws `SyntaxError`; an interrupt-handler
// abort throws `InternalError: interrupted`; a memory-limit breach throws
// `InternalError: out of memory`; anything else (TypeError, ReferenceError, a
// thrown non-Error value, ...) is a plain script runtime failure.
function mapScriptError(err: unknown): ScriptError {
  if (!(err instanceof Error)) return { type: 'runtime', message: String(err) }
  if (err.name === 'SyntaxError') return { type: 'syntax', message: err.message }
  if (err.name === 'InternalError' && err.message === 'interrupted') {
    return { type: 'timeout', message: err.message }
  }
  if (err.name === 'InternalError' && err.message === 'out of memory') {
    return { type: 'oom', message: err.message }
  }
  return { type: 'runtime', message: err.message }
}

// Runs a test script inside a fresh, isolated QuickJS context and returns
// whatever `__MCPFLO_COLLECT__` reports. `dataJson` is the SandboxInput JSON
// (src/shared/testing.types.ts) the bootstrap builds `res` from.
export async function evaluateInSandbox(input: {
  userScript: string
  dataJson: string
  timeoutMs?: number
  memoryLimitBytes?: number
  maxStackSizeBytes?: number
}): Promise<SandboxOutcome> {
  const mod = await loadModule()
  const deadline = Date.now() + (input.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  // The block below is synchronous (no `await` inside it) — Scope.withScope
  // explicitly forbids async blocks, since it disposes everything it managed
  // the instant the block returns.
  return Scope.withScope((scope) => {
    const context = scope.manage(mod.newContext())
    context.runtime.setMemoryLimit(input.memoryLimitBytes ?? MEMORY_LIMIT_BYTES)
    context.runtime.setMaxStackSize(input.maxStackSizeBytes ?? MAX_STACK_SIZE_BYTES)
    context.runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline))

    // Chai's UMD wrapper falls through `window` -> `global` -> `self` -> `this`
    // to find where to attach itself; QuickJS has none of the first two, so
    // pin `self` explicitly rather than rely on `this`-binding of a top-level
    // script eval.
    //
    // Every evalCode call below is wrapped in scope.manage(), including ones
    // whose return value is discarded — an undisposed handle doesn't throw a
    // catchable error, it crashes the whole process with a native assertion
    // when the runtime is freed. There is no partial-credit here.
    scope.manage(context.unwrapResult(context.evalCode('globalThis.self = globalThis')))
    scope.manage(context.unwrapResult(context.evalCode(chaiSource)))

    const dataHandle = scope.manage(context.newString(input.dataJson))
    context.setProp(context.global, '__MCPFLO_DATA__', dataHandle)
    scope.manage(context.unwrapResult(context.evalCode(bootstrapSource)))

    let scriptError: ScriptError | undefined
    try {
      scope.manage(context.unwrapResult(context.evalCode(input.userScript)))
    } catch (err) {
      scriptError = mapScriptError(err)
    }

    // Pump the job queue even after a script error — a `test()` call that
    // already ran and returned a promise may still settle here. This is also
    // what drives async tests to completion in the non-error path.
    context.runtime.executePendingJobs()

    let collectedJson: string | undefined
    try {
      const collected = scope.manage(context.unwrapResult(context.evalCode('__MCPFLO_COLLECT__()')))
      collectedJson = context.getString(collected)
    } catch {
      // Collection itself failed — e.g. the script error happened before
      // `test`/`__MCPFLO_COLLECT__` were even defined by the bootstrap.
      // `scriptError` (if set) is still returned below; otherwise this is
      // unexpected and worth surfacing as a runtime failure.
    }

    if (collectedJson === undefined && !scriptError) {
      scriptError = { type: 'runtime', message: 'unable to collect test results' }
    }

    return { collectedJson, scriptError }
  })
}
