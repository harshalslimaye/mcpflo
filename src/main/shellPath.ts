import { execSync } from 'node:child_process'

// Runs a command and returns its stdout. Injectable so tests can drive
// resolveShellPath without spawning a real shell.
export type ExecRunner = (command: string) => string

const defaultRunner: ExecRunner = (command) =>
  execSync(command, {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore']
  })

// A unique delimiter wrapped around the printed PATH so rc-file output noise
// can't corrupt the parsed value.
const MARKER = '__MCPFLO_PATH__'

// macOS/Linux GUI-launched apps inherit a minimal PATH (often just
// /usr/bin:/bin) that omits Homebrew (/opt/homebrew/bin, /usr/local/bin) and
// node version-manager shim dirs, so `npx`/`node`-based stdio servers fail to
// spawn with ENOENT. We resolve the user's real PATH once by asking their login
// shell — whose rc files are where nvm/fnm/asdf extend PATH — and reuse it for
// the app's lifetime. Falls back to the inherited PATH if the shell is
// unavailable or the query times out.
let resolvedPath: string | undefined
let resolved = false

export function resolveShellPath(runner: ExecRunner = defaultRunner): string | undefined {
  if (resolved) return resolvedPath
  resolved = true
  resolvedPath = process.env.PATH

  // Windows GUI processes already inherit the full PATH; the shell trick below
  // is POSIX-only.
  if (process.platform === 'win32') return resolvedPath

  try {
    const shell = process.env.SHELL || '/bin/sh'
    // A login + interactive shell runs the user's rc files (where PATH gets
    // extended). Brace-delimit ${PATH} so the trailing marker isn't absorbed
    // into the variable name (\${PATH} is a literal ${PATH} for the shell, not
    // a JS template substitution).
    const out = runner(`${shell} -ilc 'echo "${MARKER}\${PATH}${MARKER}"'`)
    const match = out.match(new RegExp(`${MARKER}(.*)${MARKER}`, 's'))
    const shellPath = (match ? match[1] : out).trim()
    if (shellPath) resolvedPath = shellPath
  } catch {
    // Shell unavailable or timed out — keep the inherited PATH.
  }
  return resolvedPath
}

// Test-only: clears the cached result so each test resolves fresh.
export function resetShellPathCache(): void {
  resolved = false
  resolvedPath = undefined
}
