import { join } from 'path'
import { existsSync } from 'fs'

// The build script copies docs/ into dist/docs so the published package is
// self-contained (dist/resources/../docs resolves correctly at runtime).
// Vitest runs directly against src/ instead of the compiled output, where
// that same relative path would land on a nonexistent src/docs — the real
// docs/ is one level further up, at the package root. Rather than
// duplicating docs/ into src/ just for tests, resolve whichever actually
// exists.
export function resolveDocsDir(fromDir: string): string {
  const distRelative = join(fromDir, '..', 'docs')
  if (existsSync(distRelative)) return distRelative
  return join(fromDir, '..', '..', 'docs')
}
