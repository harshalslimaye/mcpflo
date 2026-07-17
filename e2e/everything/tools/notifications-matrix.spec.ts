import type { Page } from '@playwright/test'
import { test, expect, openEverythingGroup } from '../../fixtures'

// notifications-matrix is the deepest schema in the Everything server: a
// nested object (quietHours) sitting alongside two arrays of objects
// (channels, routingRules), each of which contains its own array-of-enum
// field (severities, channelTypes/days). Those enum arrays render as arrays
// of single-value selects (labeled "severities-1", "days-1", …), the same
// pattern as a scalar array elsewhere in the form generator — not a native
// multi-select widget.
//
// Enabled toggles: each channel card contributes its own "enabled" switch, in
// array order, followed by quietHours' own "enabled" field (quietHours has a
// schema default so it sorts after the required `channels` array in the
// layout engine's required-first ordering) and finally the top-level
// `globalEnabled` toggle. getByRole's default name matching is a
// case-insensitive substring match, so an un-exact query for "enabled" also
// matches "globalEnabled" — every switch lookup here uses `exact: true` so
// quietHours' toggle (not globalEnabled) is what `.last()` resolves to.

async function openTool(page: Page): Promise<void> {
  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'notifications-matrix', exact: true }).click()
  await expect(page.getByLabel('profileId', { exact: true })).toBeVisible()
}

function channelsFieldset(page: Page): ReturnType<Page['locator']> {
  return page.locator('fieldset').filter({ hasText: 'channels' })
}

function routingRulesFieldset(page: Page): ReturnType<Page['locator']> {
  return page.locator('fieldset').filter({ hasText: 'routingRules' })
}

test('submits one channel and echoes every untouched matrix default', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  await page.getByLabel('profileId', { exact: true }).fill('team-a')

  // The one pre-populated channel card — severities defaults to
  // [critical, high], enabled defaults to true.
  await page.getByLabel('type', { exact: true }).selectOption({ label: 'email' })
  await page.getByLabel('target', { exact: true }).fill('alerts@example.com')

  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Profile: team-a')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Dry run: true')).toBeVisible()
  await expect(page.getByText('Global enabled: true')).toBeVisible()
  await expect(page.getByText('Digest: daily')).toBeVisible()
  await expect(page.getByText('Max per hour: 100')).toBeVisible()
  await expect(page.getByText('Quiet hours: disabled')).toBeVisible()
  await expect(page.getByText('Channels: total=1, enabled=1')).toBeVisible()
  await expect(page.getByText('Routing rules: 0')).toBeVisible()
  await expect(
    page.getByText(
      '- channel email target=alerts@example.com enabled=true severities=[critical, high]'
    )
  ).toBeVisible()
})

test('submits two channels (one disabled), custom quiet hours, and a routing rule', async ({
  page
}) => {
  test.setTimeout(60_000)

  await openTool(page)

  await page.getByLabel('profileId', { exact: true }).fill('ops-team')

  // Channel 1: email, left enabled.
  await page.getByLabel('type', { exact: true }).nth(0).selectOption({ label: 'email' })
  await page.getByLabel('target', { exact: true }).nth(0).fill('ops@example.com')

  // Channel 2: sms, toggled off. The outer channels fieldset's own Add item
  // button is its last child in DOM order — the first channel card's nested
  // severities fieldset contributes an earlier "Add item" match.
  await channelsFieldset(page).getByRole('button', { name: 'Add item' }).last().click()
  await page.getByLabel('type', { exact: true }).nth(1).selectOption({ label: 'sms' })
  await page.getByLabel('target', { exact: true }).nth(1).fill('+15550001111')
  await page.getByRole('switch', { name: 'enabled', exact: true }).nth(1).click()

  // quietHours: enable and customize the window; re-pick the first day.
  await page.getByRole('switch', { name: 'enabled', exact: true }).last().click()
  await page.getByLabel('start', { exact: true }).fill('23:00')
  await page.getByLabel('end', { exact: true }).fill('06:00')
  await page.getByLabel('timezone', { exact: true }).fill('America/Los_Angeles')
  await page.getByLabel('days-1', { exact: true }).selectOption({ label: 'fri' })

  // One routing rule, routed to the channelTypes item auto-populated by its
  // own min(1) array.
  await routingRulesFieldset(page).getByRole('button', { name: 'Add item' }).click()
  await page.getByLabel('eventType', { exact: true }).fill('deploy.completed')
  await page.getByLabel('channelTypes-1', { exact: true }).selectOption({ label: 'push' })

  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Profile: ops-team')).toBeVisible({ timeout: 10_000 })
  // Confirms the quiet-hours toggle (not the unrelated globalEnabled switch)
  // was the one flipped.
  await expect(page.getByText('Global enabled: true')).toBeVisible()
  await expect(page.getByText('Quiet hours: 23:00-06:00 America/Los_Angeles')).toBeVisible()
  await expect(page.getByText('Channels: total=2, enabled=1')).toBeVisible()
  await expect(page.getByText('Routing rules: 1')).toBeVisible()
  await expect(
    page.getByText(
      '- channel email target=ops@example.com enabled=true severities=[critical, high]'
    )
  ).toBeVisible()
  await expect(
    page.getByText('- channel sms target=+15550001111 enabled=false severities=[critical, high]')
  ).toBeVisible()
  await expect(
    page.getByText('- rule deploy.completed via=[push] minSeverity=medium')
  ).toBeVisible()
})
