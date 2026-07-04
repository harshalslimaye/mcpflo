import { promises as fs } from 'node:fs'
import { join, resolve, relative, isAbsolute, dirname } from 'node:path'
import type { TestKind } from '../../shared/testing.types'

// Persists test scripts and their last-used call inputs as plain files under a
// single root directory, one per test item:
//
//   <root>/<kind>/<encodeURIComponent(name)>.test.js
//   <root>/<kind>/<encodeURIComponent(name)>.inputs.json
//
// Deliberately plain Node (no Electron imports) and deliberately unaware of
// *which* root it's given — resolving that root (the default
// `<userData>/tests/<serverId>` vs. a user-picked custom folder) is a
// different module's job. That keeps this store trivially testable against a
// temp dir and leaves the door open for a future caller (e.g. a CLI) to point
// it elsewhere without any change here.
export interface ScriptStore {
  readScript(kind: TestKind, name: string): Promise<string | null>
  // Empty (or whitespace-only) content deletes the script file instead of
  // writing an empty one, so "the file exists" stays an honest signal for a
  // sidebar dot — no test author writes an intentionally blank script.
  writeScript(kind: TestKind, name: string, content: string): Promise<void>
  readInputs(kind: TestKind, name: string): Promise<Record<string, unknown> | null>
  writeInputs(kind: TestKind, name: string, inputs: Record<string, unknown>): Promise<void>
  // Every script file found under `root`, across all three kind subfolders.
  listScripts(): Promise<{ kind: TestKind; name: string }[]>
}

const KINDS: TestKind[] = ['tool', 'prompt', 'resource']
const SCRIPT_EXT = '.test.js'
const INPUTS_EXT = '.inputs.json'

// Resolves `parts` under `root`, throwing if the result would land outside
// it. `encodeURIComponent(name)` already keeps a well-formed name from
// escaping, but this is defense in depth against a malformed or unexpected
// `name`/`kind` value reaching here — a read or write must never leave the
// tests root.
function safeJoin(root: string, ...parts: string[]): string {
  const resolvedRoot = resolve(root)
  const target = resolve(resolvedRoot, ...parts)
  const rel = relative(resolvedRoot, target)
  if (rel === '..' || rel.startsWith(`..${'/'}`) || isAbsolute(rel)) {
    throw new Error(`Refusing to access path outside the tests root: ${parts.join('/')}`)
  }
  return target
}

function scriptPath(root: string, kind: TestKind, name: string): string {
  return safeJoin(root, kind, `${encodeURIComponent(name)}${SCRIPT_EXT}`)
}

function inputsPath(root: string, kind: TestKind, name: string): string {
  return safeJoin(root, kind, `${encodeURIComponent(name)}${INPUTS_EXT}`)
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

// Temp-file + rename so a crash mid-write can't leave a half-written script or
// inputs file behind — the same pattern oauthStore.ts uses for oauth.json.
async function writeFileAtomic(path: string, content: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await fs.writeFile(tmp, content, 'utf-8')
  await fs.rename(tmp, path)
}

export function createScriptStore(root: string): ScriptStore {
  return {
    async readScript(kind, name) {
      return readFileOrNull(scriptPath(root, kind, name))
    },

    async writeScript(kind, name, content) {
      const path = scriptPath(root, kind, name)
      if (content.trim() === '') {
        await fs.rm(path, { force: true })
        return
      }
      await writeFileAtomic(path, content)
    },

    async readInputs(kind, name) {
      const raw = await readFileOrNull(inputsPath(root, kind, name))
      if (raw === null) return null
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        // A corrupt or partially-written inputs file is treated as absent
        // rather than surfacing a raw parse error — it's a machine-managed
        // cache of last-used values, not something worth failing a call over.
        return null
      }
    },

    async writeInputs(kind, name, inputs) {
      const path = inputsPath(root, kind, name)
      await writeFileAtomic(path, JSON.stringify(inputs, null, 2))
      // Inputs echo argument values the user typed, which may include
      // secrets — keep the file private, same rationale as store.ts's
      // config.json. Best-effort: an unsupported FS must not break
      // persistence.
      try {
        await fs.chmod(path, 0o600)
      } catch {
        // See above.
      }
    },

    async listScripts() {
      const found: { kind: TestKind; name: string }[] = []
      for (const kind of KINDS) {
        const dir = join(root, kind)
        let entries: string[]
        try {
          entries = await fs.readdir(dir)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw err
        }
        for (const entry of entries) {
          if (!entry.endsWith(SCRIPT_EXT)) continue
          const encodedName = entry.slice(0, -SCRIPT_EXT.length)
          found.push({ kind, name: decodeURIComponent(encodedName) })
        }
      }
      return found
    }
  }
}
