// Removes build output directories so each build starts from a clean slate.
// Cross-platform (no shell-specific rm); safe to run when the dirs don't exist.

const { rmSync, existsSync } = require('node:fs')
const { resolve } = require('node:path')

const targets = ['dist', 'out']

for (const target of targets) {
  const dir = resolve(process.cwd(), target)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
    console.log(`[clean] removed ${target}/`)
  } else {
    console.log(`[clean] ${target}/ not present, skipping`)
  }
}
