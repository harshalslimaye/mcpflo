import { test, expect } from '../fixtures'

// autoUpdater.ts is disabled for unpackaged launches (app.isPackaged is false
// here, same as `npm run dev`), so this doesn't exercise a real network check
// — that's covered by the manual dev-smoke recipe with MCPFLO_TEST_UPDATES=1.
// What unit tests can't reach (they mock window.api / electron entirely) is
// the real preload bridge -> real IPC round trip -> real main-process
// getUpdateStatus() actually wiring up in a live app, and confirming the
// disabled-updater path never crashes or hangs the window.

test('shows the running app version and survives a "Check for updates" click when unpackaged', async ({
  page
}) => {
  const button = page.getByRole('button', { name: 'Check for updates' })
  await expect(button).toBeVisible()
  await expect(button).toHaveText(/^v\d+\.\d+\.\d+$/)

  await button.click()

  // Disabled (unpackaged) updater: the check IPC resolves without hitting
  // the network or crashing the window — the control stays exactly as-is.
  await expect(button).toBeVisible()
  await expect(button).toHaveText(/^v\d+\.\d+\.\d+$/)
})
