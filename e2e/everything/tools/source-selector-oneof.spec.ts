import type { Page } from '@playwright/test'
import { test, expect, openEverythingGroup } from '../../fixtures'

// source-selector-oneof stress-tests RJSF's variant selector for a
// discriminated union: `source` renders as a select ("Option 1/2/3" for
// git/url/localFile) that swaps the nested field set when changed, with each
// variant's defaults (ref=main, shallow, followRedirects, encoding) filled in.

async function openTool(page: Page): Promise<void> {
  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'source-selector-oneof', exact: true }).click()
  // The variant select carries the union property's name as its label.
  await expect(page.getByLabel('source', { exact: true })).toBeVisible()
}

test('submits the default git variant with its branch defaults', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  // git is the first union branch, so it is pre-selected with its defaults.
  await expect(page.getByLabel('sourceType', { exact: true })).toHaveValue('git')
  await expect(page.getByLabel('ref', { exact: true })).toHaveValue('main')

  await page.getByLabel('repoUrl', { exact: true }).fill('https://github.com/acme/widgets.git')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Source branch: git')).toBeVisible({ timeout: 10_000 })
  await expect(
    page.getByText(
      'Resolved source: git repo=https://github.com/acme/widgets.git ref=main shallow=true'
    )
  ).toBeVisible()

  // Untouched top-level fields keep their schema defaults.
  await expect(page.getByText('Include globs: (none)')).toBeVisible()
  await expect(page.getByText('Max files: 200')).toBeVisible()
})

test('switches to the url variant, swapping fields and defaults', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)

  await page.getByLabel('source', { exact: true }).selectOption({ label: 'Option 2' })

  // The git fields are gone, the url branch's fields (and defaults) replace them.
  await expect(page.getByLabel('repoUrl', { exact: true })).not.toBeVisible()
  await expect(page.getByLabel('sourceType', { exact: true })).toHaveValue('url')

  await page.getByLabel('url', { exact: true }).fill('https://example.com/data.json')
  await page.getByLabel('authHeader', { exact: true }).fill('Bearer token-123')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Source branch: url')).toBeVisible({ timeout: 10_000 })
  await expect(
    page.getByText(
      'Resolved source: url target=https://example.com/data.json followRedirects=true auth=true'
    )
  ).toBeVisible()
})

test('switches to the localFile variant and fills the shared array and number fields', async ({
  page
}) => {
  test.setTimeout(60_000)

  await openTool(page)

  await page.getByLabel('source', { exact: true }).selectOption({ label: 'Option 3' })
  await expect(page.getByLabel('sourceType', { exact: true })).toHaveValue('localFile')

  await page.getByLabel('filePath', { exact: true }).fill('/tmp/data/input.txt')

  // includeGlobs is a scalar string array — grown via its fieldset's Add item.
  const globs = page.locator('fieldset').filter({ hasText: 'includeGlobs' })
  await globs.getByRole('button', { name: 'Add item' }).click()
  await globs.getByRole('textbox').nth(0).fill('src/**')
  await globs.getByRole('button', { name: 'Add item' }).click()
  await globs.getByRole('textbox').nth(1).fill('docs/**')

  await page.getByLabel('maxFiles', { exact: true }).fill('50')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Source branch: localFile')).toBeVisible({ timeout: 10_000 })
  await expect(
    page.getByText('Resolved source: localFile path=/tmp/data/input.txt encoding=utf-8')
  ).toBeVisible()
  await expect(page.getByText('Include globs: src/**, docs/**')).toBeVisible()
  await expect(page.getByText('Max files: 50')).toBeVisible()
})
