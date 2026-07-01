// Server ids are always crypto.randomUUID() (store.ts), and every per-server
// on-disk path (capabilitiesCache.ts, oauthStore.ts) is built by joining an id
// straight onto a base directory. That's only safe as long as the id can't
// contain path separators or "..", which is true for ids this process
// generates itself — but IPC handlers receive ids from the renderer, which
// also displays fully attacker-controlled MCP content. Call this at the top
// of every IPC handler that takes an id, before it reaches any fs path, so a
// non-UUID string is rejected at the trust boundary rather than relied upon
// never occurring.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertValidServerId(id: string): void {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new Error(`Invalid server id: ${JSON.stringify(id)}`)
  }
}
