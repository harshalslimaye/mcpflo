import type { Page } from '@playwright/test'
import { test, expect, openEverythingGroup } from '../../fixtures'

// deep-nesting-cutoff stress-tests the form generator's depth cap: children[].
// payload sits 4 object/array levels deep (tree > root > children > payload),
// past the generator's MAX_CONTAINER_DEPTH of 3, so it falls back to a raw JSON
// textarea (aria-label "payload") instead of a nested form — everything above
// that line (profile, tree.root.name, children.id) still renders as real
// fields. This is the one Everything-server tool that exercises that fallback.

async function openTool(page: Page): Promise<void> {
  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'deep-nesting-cutoff', exact: true }).click()
  await expect(page.getByLabel('profile', { exact: true })).toBeVisible()
}

function structuredOutputCard(page: Page): ReturnType<Page['locator']> {
  return page.getByText('structured output', { exact: true }).locator('xpath=..')
}

test('fills the form down to the cutoff, editing the deep payload as JSON', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  // profile/tree.root.name/children pre-populate from schema defaults; only
  // the required id and the payload past the cutoff need filling.
  await page.getByLabel('id', { exact: true }).fill('node-a')

  // The payload textarea already holds the schema's default `config`
  // sub-object as JSON — only depthMarker (no default, required) is missing.
  const payloadText = JSON.stringify(
    { depthMarker: 4, config: { retries: 3, flags: [true], labels: ['deep'] } },
    null,
    2
  )
  await page.getByLabel('payload', { exact: true }).fill(payloadText)

  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Profile: default-profile')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Strict mode: false')).toBeVisible()
  await expect(page.getByText('Root name: root-node')).toBeVisible()
  await expect(page.getByText('Child count: 1')).toBeVisible()
  await expect(page.getByText('Max depth marker: 4')).toBeVisible()
  await expect(page.getByText('Child ids: node-a')).toBeVisible()

  // Confirms the config defaults typed into the JSON textarea (not just
  // depthMarker) actually reached the server, via the structured content echo.
  const card = structuredOutputCard(page)
  await expect(card.getByText(/"retries":\s*3/)).toBeVisible()
  await expect(card.getByText(/"labels":\s*\[\s*"deep"/)).toBeVisible()
})

test('submits a full payload via Raw JSON mode with three children', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  await page.getByRole('switch', { name: 'Edit as raw JSON' }).click()

  const payload = {
    profile: 'custom-profile',
    strict: true,
    tree: {
      root: {
        name: 'custom-root',
        children: [
          {
            id: 'c1',
            payload: { depthMarker: 1, config: { retries: 3, flags: [true], labels: ['deep'] } }
          },
          {
            id: 'c2',
            payload: { depthMarker: 5, config: { retries: 3, flags: [true], labels: ['deep'] } }
          },
          {
            id: 'c3',
            payload: { depthMarker: 2, config: { retries: 3, flags: [true], labels: ['deep'] } }
          }
        ]
      }
    }
  }
  await page.getByLabel('Params JSON', { exact: true }).fill(JSON.stringify(payload, null, 2))
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Profile: custom-profile')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Strict mode: true')).toBeVisible()
  await expect(page.getByText('Root name: custom-root')).toBeVisible()
  await expect(page.getByText('Child count: 3')).toBeVisible()
  await expect(page.getByText('Max depth marker: 5')).toBeVisible()
  await expect(page.getByText('Child ids: c1, c2, c3')).toBeVisible()
})

test('blocks execution and reverting to form mode on invalid Raw JSON', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  await page.getByRole('switch', { name: 'Edit as raw JSON' }).click()
  await page.getByLabel('Params JSON', { exact: true }).fill('{ "profile": "broken"')

  await expect(page.getByRole('button', { name: 'Execute', exact: true })).toBeDisabled()
  await expect(page.locator('p.text-red-400').first()).toBeVisible()

  // Trying to switch back to the form is rejected while the JSON doesn't
  // parse — the toggle's own onChange path re-validates before flipping mode.
  await page.getByRole('switch', { name: 'Edit as raw JSON' }).click()
  await expect(page.getByRole('switch', { name: 'Edit as raw JSON' })).toHaveAttribute(
    'aria-checked',
    'true'
  )
  await expect(page.getByLabel('Params JSON', { exact: true })).toBeVisible()
})
