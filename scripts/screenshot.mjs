import { _electron as electron } from 'playwright-core'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(__dirname, '..')
const SHOT_DIR = '/tmp/mcpflo-shots'

import * as fs from 'node:fs'
fs.mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = path.join(
  APP_DIR,
  'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
)

async function shot(theme) {
  const app = await electron.launch({
    executablePath: electronBin,
    args: [APP_DIR],
    env: { ...process.env, ELECTRON_FORCE_WINDOW_MENU_BAR: '0' },
    timeout: 30_000
  })

  await new Promise((r) => setTimeout(r, 4000))
  const page =
    app.windows().find((w) => !w.url().startsWith('devtools://')) ?? (await app.firstWindow())

  // Set theme via localStorage and reload
  await page.evaluate((t) => {
    localStorage.setItem('mcpflo-theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }, theme)
  await new Promise((r) => setTimeout(r, 500))

  const file = path.join(SHOT_DIR, `${theme}.png`)
  await page.screenshot({ path: file })
  console.log(`screenshot: ${file}`)

  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await new Promise((r) => setTimeout(r, 300))
  if (errors.length) console.log('Console errors:', errors)
  else console.log('No console errors')

  await app.close()
}

await shot('dark')
await shot('light')
