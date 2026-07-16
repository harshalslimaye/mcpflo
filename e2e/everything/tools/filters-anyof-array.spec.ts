import type { Page } from '@playwright/test'
import { test, expect, openEverythingGroup } from '../../fixtures'

// filters-anyof-array stress-tests an array whose items are a union
// (tag/dateRange/threshold). Each item renders as a flat row with its own
// variant select (labeled "filters-<index>", options "Option 1/2/3"); minItems
// pre-populates the first item as the tag variant, whose nested `values` array
// likewise pre-populates one input (labeled "values-1").
//
// Two "Add item" buttons coexist: the nested values array's (inside the tag
// item, first in DOM) and the filters array's own (last in DOM) — hence the
// .first()/.last() scoping below.

async function openTool(page: Page): Promise<void> {
  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'filters-anyof-array', exact: true }).click()
  await expect(page.getByLabel('filters-0', { exact: true })).toBeVisible()
}

const addFilter = (page: Page): ReturnType<Page['getByRole']> =>
  page.getByRole('button', { name: 'Add item' }).last()

test('submits a single tag filter and echoes the top-level defaults', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  // The pre-populated first item is already the tag variant.
  await expect(page.getByLabel('type', { exact: true })).toHaveValue('tag')
  await page.getByLabel('field', { exact: true }).fill('category')
  await page.getByLabel('values-1', { exact: true }).fill('books')

  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Filter count: 1')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('By type: tag=1, dateRange=0, threshold=0')).toBeVisible()
  await expect(page.getByText('- tag category include [books]')).toBeVisible()

  // combineWith/limit/mode were never touched — schema defaults come through.
  await expect(page.getByText('Combine with: and')).toBeVisible()
  await expect(page.getByText('Limit: 100')).toBeVisible()
})

test('mixes all three filter variants in one submission', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  // Item 1 (tag): two values — grown via the nested values array's Add button.
  await page.getByLabel('field', { exact: true }).nth(0).fill('category')
  await page.getByLabel('values-1', { exact: true }).fill('books')
  await page.getByRole('button', { name: 'Add item' }).first().click()
  await page.getByLabel('values-2', { exact: true }).fill('games')

  // Item 2: added as a tag item, then switched to the dateRange variant.
  await addFilter(page).click()
  await page.getByLabel('filters-1', { exact: true }).selectOption({ label: 'Option 2' })
  await page.getByLabel('field', { exact: true }).nth(1).fill('createdAt')
  await page.getByLabel('from', { exact: true }).fill('2026-01-01')
  await page.getByLabel('to', { exact: true }).fill('2026-06-30')

  // Item 3: switched to the threshold variant.
  await addFilter(page).click()
  await page.getByLabel('filters-2', { exact: true }).selectOption({ label: 'Option 3' })
  await page.getByLabel('field', { exact: true }).nth(2).fill('score')
  await page.getByLabel('op', { exact: true }).selectOption({ label: 'gte' })
  await page.getByLabel('value', { exact: true }).fill('42')

  await page.getByLabel('combineWith', { exact: true }).selectOption({ label: 'or' })
  await page.getByLabel('limit', { exact: true }).fill('25')

  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Filter count: 3')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Combine with: or')).toBeVisible()
  await expect(page.getByText('Limit: 25')).toBeVisible()
  await expect(page.getByText('By type: tag=1, dateRange=1, threshold=1')).toBeVisible()
  await expect(page.getByText('- tag category include [books, games]')).toBeVisible()
  await expect(page.getByText('- dateRange createdAt 2026-01-01..2026-06-30 tz=UTC')).toBeVisible()
  await expect(page.getByText('- threshold score gte 42')).toBeVisible()
})

test('reorders and removes filter rows', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  await page.getByLabel('field', { exact: true }).nth(0).fill('alpha')
  await page.getByLabel('values-1', { exact: true }).fill('a')

  await addFilter(page).click()
  await page.getByLabel('filters-1', { exact: true }).selectOption({ label: 'Option 3' })
  await page.getByLabel('field', { exact: true }).nth(1).fill('beta')
  await page.getByLabel('op', { exact: true }).selectOption({ label: 'lt' })
  await page.getByLabel('value', { exact: true }).fill('10')

  // Text matching normalizes newlines to spaces, so an ordered substring
  // across the two filter lines asserts their order in the output.
  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('- tag alpha include [a] - threshold beta lt 10')).toBeVisible({
    timeout: 10_000
  })

  // Only the second row can move up (first row only offers move-down), so the
  // locator is unambiguous. Single-item nested arrays render no move buttons.
  await page.getByRole('button', { name: 'Move item up' }).click()
  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('- threshold beta lt 10 - tag alpha include [a]')).toBeVisible({
    timeout: 10_000
  })

  // Remove the (now first) threshold row. The first Remove button in DOM order
  // belongs to it — the tag row's nested values array contributes the others.
  await page.getByRole('button', { name: 'Remove item' }).first().click()
  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('Filter count: 1')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('By type: tag=1, dateRange=0, threshold=0')).toBeVisible()
})
