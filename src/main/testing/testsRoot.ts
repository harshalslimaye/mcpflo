import { app } from 'electron'
import { join } from 'node:path'

// Resolves the on-disk tests root for a server: `<userData>/tests/<serverId>`.
// A per-server custom folder override (`testsPath` on the server config) is a
// later addition and will replace this with a real default-vs-custom
// resolution step — every caller already goes through this function, so that
// change stays contained here.
export function resolveTestsRoot(serverId: string): string {
  return join(app.getPath('userData'), 'tests', serverId)
}
