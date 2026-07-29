import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { CachedCapabilities, ConnectResult } from '../shared/mcp.types'

// Each server owns a folder under <userData>/servers/<serverId>/. Capabilities
// live in capabilities.json inside it. Per-server files (rather than one global
// map) avoid read-modify-write races between concurrent fetches, isolate
// corruption, and give future per-server data (logs, history) a natural home.
//
// Server IDs are crypto.randomUUID() — hex + hyphens — so they're already safe
// as folder names without sanitisation.

function serversDir(): string {
  return join(app.getPath('userData'), 'servers')
}

function serverDir(id: string): string {
  return join(serversDir(), id)
}

function capabilitiesFile(id: string): string {
  return join(serverDir(id), 'capabilities.json')
}

// Anything on disk is untrusted: an older MCPFlo may not have written a field
// that today's code reads, and a crash or a full disk can leave a file that
// parses but holds the wrong shapes. Casting the parse result would push those
// problems into the renderer, where a missing array shows up as a blank sidebar
// far from its cause. So shape the object once, here at the read boundary, and
// let every caller treat the result as sound.
//
// Unknown keys are kept rather than dropped: a newer version of the app may
// have written fields this build doesn't know about, and preserving them means
// downgrading and upgrading again doesn't silently discard the cache.
// `typeof null` is 'object' and so is an array, so a bare typeof check isn't
// enough to conclude "a record of fields".
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCapabilities(parsed: unknown): CachedCapabilities | undefined {
  if (!isPlainObject(parsed)) return undefined
  const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
  return {
    ...parsed,
    tools: list(parsed.tools),
    resources: list(parsed.resources),
    prompts: list(parsed.prompts),
    resourceTemplates: list(parsed.resourceTemplates),
    fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
    // Only the outer shape is checked; the flags inside are left as written,
    // since the renderer reads each one defensively anyway. Hence the assertion
    // through unknown — it's a claim about the contents, not a proof.
    features: isPlainObject(parsed.features)
      ? (parsed.features as unknown as CachedCapabilities['features'])
      : undefined
  }
}

export async function readCapabilities(id: string): Promise<CachedCapabilities | undefined> {
  try {
    const raw = await fs.readFile(capabilitiesFile(id), 'utf-8')
    return normalizeCapabilities(JSON.parse(raw))
  } catch {
    return undefined
  }
}

export async function writeCapabilities(id: string, result: ConnectResult): Promise<void> {
  await fs.mkdir(serverDir(id), { recursive: true })
  const payload: CachedCapabilities = { ...result, fetchedAt: Date.now() }
  // Write to a temp file then rename so a crash mid-write can't leave a
  // half-written capabilities.json behind.
  const file = capabilitiesFile(id)
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

// Clears just the capabilities cache, leaving the server's folder (and any
// future per-server data) intact.
export async function clearCapabilities(id: string): Promise<void> {
  await fs.rm(capabilitiesFile(id), { force: true })
}

// Removes the entire per-server folder — used when the server itself is deleted.
export async function removeServerDir(id: string): Promise<void> {
  await fs.rm(serverDir(id), { recursive: true, force: true })
}

// Reads every server's cached capabilities into a { [id]: caps } map for hydrate.
export async function readAllCapabilities(): Promise<Record<string, CachedCapabilities>> {
  const out: Record<string, CachedCapabilities> = {}
  try {
    const entries = await fs.readdir(serversDir(), { withFileTypes: true })
    await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (e) => {
          const caps = await readCapabilities(e.name)
          if (caps) out[e.name] = caps
        })
    )
  } catch {
    // servers dir doesn't exist yet — no cache
  }
  return out
}
