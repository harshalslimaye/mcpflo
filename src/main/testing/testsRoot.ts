import { app } from 'electron'
import { join } from 'node:path'
import { getServerById } from '../store'

// Resolves the on-disk tests root for a server: the user-picked `testsPath`
// if one is configured, else the default `<userData>/tests/<serverId>`. A
// custom folder is used as-is (no `serverId` subfolder appended underneath
// it) — the picked folder *is* the root. Every testing: IPC handler goes
// through this one function, so this is the only place that needs to know
// about the default-vs-custom distinction.
//
// If a configured custom folder no longer exists on disk, this still returns
// that (missing) path rather than silently falling back to the default —
// scriptStore's reads already tolerate a missing directory (ENOENT ⇒ empty/
// null), and a write would recreate the folder at the same custom location,
// which is correct: never redirect to a location the user didn't choose.
export function resolveTestsRoot(serverId: string): string {
  const server = getServerById(serverId)
  return server.testsPath ?? join(app.getPath('userData'), 'tests', serverId)
}
