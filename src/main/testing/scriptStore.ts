import { promises as fs } from 'node:fs'
import { join, resolve, relative, isAbsolute, dirname } from 'node:path'
import type { TestKind, RequestsFile } from '../../shared/testing.types'

// Persists test scripts and saved requests as plain files under a single
// root directory, one per test item:
//
//   <root>/<kind>/<encodeURIComponent(name)>.test.js
//   <root>/<kind>/<encodeURIComponent(name)>.requests.json
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
  // Every script file found under `root`, across all three kind subfolders.
  listScripts(): Promise<{ kind: TestKind; name: string }[]>
  readRequests(kind: TestKind, name: string): Promise<RequestsFile | null>
  // An empty `requests` list deletes the file rather than writing an empty
  // one, same convention as writeScript — no need to keep a husk around once
  // the user has removed every saved request for this capability.
  writeRequests(kind: TestKind, name: string, file: RequestsFile): Promise<void>
}

const KINDS: TestKind[] = ['tool', 'prompt', 'resource']
const SCRIPT_EXT = '.test.js'
const REQUESTS_EXT = '.requests.json'

// Whether a `path.relative(root, target)` result means `target` landed
// outside `root`. Split on both separators rather than checking
// `startsWith('../')` alone — `path.relative` joins with `\` on Windows, so a
// forward-slash-only check silently misses an escape there. Exported only for
// direct unit testing (see scriptStore.test.ts); not part of the ScriptStore
// public API.
export function escapesRoot(rel: string): boolean {
  return isAbsolute(rel) || rel.split(/[\\/]/)[0] === '..'
}

// Resolves `parts` under `root`, throwing if the result would land outside
// it. `encodeURIComponent(name)` already keeps a well-formed name from
// escaping, but this is defense in depth against a malformed or unexpected
// `name`/`kind` value reaching here — a read or write must never leave the
// tests root.
function safeJoin(root: string, ...parts: string[]): string {
  const resolvedRoot = resolve(root)
  const target = resolve(resolvedRoot, ...parts)
  const rel = relative(resolvedRoot, target)
  if (escapesRoot(rel)) {
    throw new Error(`Refusing to access path outside the tests root: ${parts.join('/')}`)
  }
  return target
}

function scriptPath(root: string, kind: TestKind, name: string): string {
  return safeJoin(root, kind, `${encodeURIComponent(name)}${SCRIPT_EXT}`)
}

function requestsPath(root: string, kind: TestKind, name: string): string {
  return safeJoin(root, kind, `${encodeURIComponent(name)}${REQUESTS_EXT}`)
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
// requests file behind — the same pattern oauthStore.ts uses for oauth.json.
async function writeFileAtomic(path: string, content: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await fs.writeFile(tmp, content, 'utf-8')
  await fs.rename(tmp, path)
}

// Saved requests echo argument values the user typed, which may include
// secrets — keep the file private, same rationale as store.ts's config.json.
// Best-effort: an unsupported FS must not break persistence.
async function tightenPermissions(path: string): Promise<void> {
  try {
    await fs.chmod(path, 0o600)
  } catch {
    // See above.
  }
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
    },

    async readRequests(kind, name) {
      const raw = await readFileOrNull(requestsPath(root, kind, name))
      if (raw === null) return null
      try {
        return JSON.parse(raw) as RequestsFile
      } catch {
        // A corrupt file (e.g. a synced-folder conflict copy) is treated as
        // absent, not a thrown error.
        return null
      }
    },

    async writeRequests(kind, name, file) {
      const path = requestsPath(root, kind, name)
      if (file.requests.length === 0) {
        await fs.rm(path, { force: true })
        return
      }
      await writeFileAtomic(path, JSON.stringify(file, null, 2))
      await tightenPermissions(path)
    }
  }
}
