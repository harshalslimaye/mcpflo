import { execFileSync } from 'node:child_process'

// macOS/Linux GUI apps launched from Finder/Dock inherit launchd's minimal PATH
// (`/usr/bin:/bin:/usr/sbin:/sbin`), not the user's shell PATH. That means tools
// installed via Homebrew, nvm, fnm, pnpm, or /usr/local/bin — including `node`
// and `npx` — aren't found, so spawning stdio MCP servers fails silently.
//
// We resolve the real PATH by asking the user's login shell for it, then merge it
// into process.env.PATH. The MCP stdio transport reads process.env.PATH (via the
// SDK's getDefaultEnvironment), so this makes spawned servers resolvable.
//
// Runs synchronously at startup, before any server is spawned. Wrapped so a slow or
// broken shell profile degrades gracefully instead of hanging or crashing launch.

const SENTINEL_START = '__MCPFLO_PATH_START__'
const SENTINEL_END = '__MCPFLO_PATH_END__'

// Common locations a GUI PATH usually lacks; appended as a fallback so node/npx
// resolve even if the shell query fails entirely.
const FALLBACK_DIRS = ['/opt/homebrew/bin', '/usr/local/bin']

function resolveShellPath(): string | undefined {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    // -ilc: interactive login shell so it sources the user's profile (where nvm/
    // homebrew/etc. amend PATH). The sentinels isolate PATH from any profile noise.
    const out = execFileSync(
      shell,
      ['-ilc', `printf '${SENTINEL_START}%s${SENTINEL_END}' "$PATH"`],
      // Ignore the shell's stderr: interactive profiles often emit harmless noise
      // (e.g. zsh's "compdef: command not found") that we don't want to surface.
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const match = out.match(new RegExp(`${SENTINEL_START}(.*)${SENTINEL_END}`, 's'))
    return match?.[1]?.trim() || undefined
  } catch {
    return undefined
  }
}

// Merges the resolved shell PATH (and fallbacks) into process.env.PATH, preserving
// order and dropping duplicates. No-op on Windows, where GUI apps already get a
// usable PATH.
export function fixPath(): void {
  if (process.platform === 'win32') {
    return
  }

  const current = process.env.PATH ? process.env.PATH.split(':') : []
  const resolved = resolveShellPath()?.split(':') ?? []

  const merged: string[] = []
  for (const dir of [...resolved, ...current, ...FALLBACK_DIRS]) {
    if (dir && !merged.includes(dir)) {
      merged.push(dir)
    }
  }

  process.env.PATH = merged.join(':')
}
