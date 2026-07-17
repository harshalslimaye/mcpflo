import { test, expect } from '../fixtures'

// The sidebar filter box (SecondarySidebar) is exhaustively unit-tested against
// a mocked server list — filtering by name, matching resources, hiding
// non-matching servers/groups, restoring the tree on clear. These two specs
// don't re-litigate that logic; they confirm the same behavior holds against
// the real running app (a real fetched capability tree, a real DOM), which the
// unit tests' mocked store can't exercise.

async function expandEverything(page: import('@playwright/test').Page): Promise<void> {
  const row = page.getByRole('group', { name: 'Everything' })
  await row.getByRole('button', { name: 'Expand' }).click()
  await expect(page.getByRole('button', { name: /^Tools/ })).toBeEnabled({ timeout: 30_000 })
}

test('filtering surfaces a matching resource without manually expanding its group', async ({
  page
}) => {
  await expandEverything(page)

  // Neither Tools nor Resources has been manually expanded — filtering alone
  // must force both groups open (or closed, if they have no match).
  await page.getByPlaceholder('Filter tools, resources…').fill('architecture')

  await expect(page.getByRole('button', { name: 'architecture.md', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'get-sum', exact: true })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'echo', exact: true })).not.toBeVisible()
})

test('clearing the filter restores a manually expanded group', async ({ page }) => {
  await expandEverything(page)
  await page.getByRole('button', { name: /^Tools/ }).click()
  await expect(page.getByRole('button', { name: 'echo', exact: true })).toBeVisible()

  const filterInput = page.getByPlaceholder('Filter tools, resources…')
  await filterInput.fill('sum')
  await expect(page.getByRole('button', { name: 'get-sum', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'echo', exact: true })).not.toBeVisible()

  await filterInput.fill('')
  await expect(page.getByRole('button', { name: 'echo', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'get-sum', exact: true })).toBeVisible()
})
