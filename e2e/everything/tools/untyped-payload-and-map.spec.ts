import type { Page } from '@playwright/test'
import { test, expect, openEverythingGroup } from '../../fixtures'

// untyped-payload-and-map stress-tests two schema shapes the form generator
// treats specially: `payload` (z.unknown(), no structural keywords) renders as
// a raw JSON textarea via the JsonField fallback; `labels`/`options`
// (z.record(...), additionalProperties-only objects with no declared
// `properties`) have no way to add entries in Form mode at all — the object
// template has nothing to lay out until a key exists, and nothing in the UI
// offers to create one. So exercising the maps requires Raw JSON mode; the
// last test below documents that as the only path, rather than assuming an
// "Add property" control that doesn't exist.

async function openTool(page: Page): Promise<void> {
  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'untyped-payload-and-map', exact: true }).click()
  await expect(page.getByLabel('payload', { exact: true })).toBeVisible()
}

test('submits an object payload with the maps left at their empty defaults', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  await page.getByLabel('payload', { exact: true }).fill(JSON.stringify({ a: 1, b: 'x' }))
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Payload type: object')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Strict mode: false')).toBeVisible()
  await expect(page.getByText('Label count: 0')).toBeVisible()
  await expect(page.getByText('Option count: 0')).toBeVisible()
  await expect(page.getByText('Label keys: (none)')).toBeVisible()
  await expect(page.getByText('Option keys: (none)')).toBeVisible()
})

test('reports the payload type for array, string, and boolean values across executions', async ({
  page
}) => {
  test.setTimeout(60_000)

  await openTool(page)
  const payloadField = page.getByLabel('payload', { exact: true })
  const execute = page.getByRole('button', { name: 'Execute', exact: true })

  await payloadField.fill('[1, 2, 3]')
  await execute.click()
  await expect(page.getByText('Payload type: array')).toBeVisible({ timeout: 10_000 })

  await payloadField.fill('"hello"')
  await execute.click()
  await expect(page.getByText('Payload type: string')).toBeVisible({ timeout: 10_000 })

  await payloadField.fill('true')
  await execute.click()
  await expect(page.getByText('Payload type: boolean')).toBeVisible({ timeout: 10_000 })
})

test('populates the label and option maps via Raw JSON mode', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  await page.getByRole('switch', { name: 'Edit as raw JSON' }).click()

  const payload = {
    payload: { a: 1 },
    labels: { env: 'prod', team: 'platform' },
    options: { retries: 3, verbose: true },
    strict: true
  }
  await page.getByLabel('Params JSON', { exact: true }).fill(JSON.stringify(payload, null, 2))
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Payload type: object')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Strict mode: true')).toBeVisible()
  await expect(page.getByText('Label count: 2')).toBeVisible()
  await expect(page.getByText('Option count: 2')).toBeVisible()
  await expect(page.getByText('Label keys: env, team')).toBeVisible()
  await expect(page.getByText('Option keys: retries, verbose')).toBeVisible()
})
