import { test, expect, openEverythingGroup } from '../fixtures'

// ActivityRail/History are exhaustively unit-tested against a mocked history
// array — clicking an entry pre-fills the form, shows that entry's response,
// clear empties the list. What those tests can't reach is whether the real
// executeTool round trip actually produces a history entry whose args/result
// come back out correctly when selected — that's what these two specs cover,
// against the real Everything server.

test('selecting an older History entry restores its args and result', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'get-sum', exact: true }).click()

  await page.getByLabel('a', { exact: true }).fill('2')
  await page.getByLabel('b', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('The sum of 2 and 3 is 5.')).toBeVisible({ timeout: 10_000 })

  await page.getByLabel('a', { exact: true }).fill('10')
  await page.getByLabel('b', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('The sum of 10 and 20 is 30.')).toBeVisible({ timeout: 10_000 })

  // ActivityRail defaults to "All" — switch to this tool's own history.
  await page.getByRole('button', { name: 'This tool', exact: true }).click()

  // The older (2, 3) call's row is identified by its argument-summary detail
  // line, distinguishing it from the newer (10, 20) entry above it.
  await page.getByText('{"a":2,"b":3}', { exact: true }).click()

  await expect(page.getByLabel('a', { exact: true })).toHaveValue('2')
  await expect(page.getByLabel('b', { exact: true })).toHaveValue('3')
  await expect(page.getByText('The sum of 2 and 3 is 5.')).toBeVisible()
})

test('clearing This tool history empties the list', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'get-sum', exact: true }).click()

  await page.getByLabel('a', { exact: true }).fill('1')
  await page.getByLabel('b', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('The sum of 1 and 1 is 2.')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'This tool', exact: true }).click()
  await expect(page.getByText('{"a":1,"b":1}', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'clear', exact: true }).click()

  await expect(page.getByText('No calls yet.')).toBeVisible()
  await expect(page.getByText('{"a":1,"b":1}', { exact: true })).not.toBeVisible()
})
