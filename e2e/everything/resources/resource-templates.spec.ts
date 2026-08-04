import { test, expect, openEverythingGroup } from '../../fixtures'

// Drives a resource template end to end against the bundled Everything server
// (packages/server-everything/src/resources/templates.ts): its two dynamic
// templates are listed in their own sidebar group, the {resourceId} variable
// becomes a form field, the URI the read will use is previewed as it's typed,
// and reads with different values collect into one history keyed by the
// template rather than by what it expanded to.
test("reads the Everything server's dynamic text resource template", async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')

  // Both templates are listed, and by name rather than by uriTemplate.
  await expect(
    page.getByRole('button', { name: 'Dynamic Text Resource', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Dynamic Blob Resource', exact: true })
  ).toBeVisible()

  await page.getByRole('button', { name: 'Dynamic Text Resource', exact: true }).click()

  // The {resourceId} variable becomes one required form field — unlike a plain
  // resource, which shows a fixed read-only URI and no form.
  // A combobox, not a plain textbox: the Everything server declares the
  // completions capability, so every template variable gets the typeahead.
  const resourceId = page.getByRole('combobox', { name: 'resourceId', exact: true })
  await expect(resourceId).toBeVisible()

  const preview = page.getByTestId('expanded-uri')
  // Nothing filled in yet: the template itself stands in, and Read is refused.
  await expect(preview).toHaveText('mcpflo://dynamic/text/{resourceId}')
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toBeDisabled()

  await resourceId.fill('5')
  await expect(preview).toHaveText('mcpflo://dynamic/text/5')

  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByText('Resource 5:')).toBeVisible({ timeout: 10_000 })

  // A second read with a different value lands in the same history — the point
  // of keying it by the template. Two lists of one would be no history at all.
  await resourceId.fill('3')
  await expect(preview).toHaveText('mcpflo://dynamic/text/3')
  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByText('Resource 3:')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: /This template/ }).click()
  // Scoped to the history rail: the expanded URI also appears in the preview
  // above, so an unscoped match would be ambiguous.
  const rail = page.locator('aside')
  // Every row shares the template as its label, so each is identified by the
  // URI it actually read.
  await expect(rail.getByText('mcpflo://dynamic/text/5', { exact: true })).toBeVisible()
  await expect(rail.getByText('mcpflo://dynamic/text/3', { exact: true })).toBeVisible()

  // Selecting a past read re-fills the form with the values it ran with, so it
  // can be edited and re-run — a plain resource read has nothing to restore.
  await rail.getByText('mcpflo://dynamic/text/5', { exact: true }).click()
  await expect(resourceId).toHaveValue('5')
})

// The templates group is new in the sidebar tree, so this checks it slots in
// beside the existing three rather than displacing them — against a real
// fetched capability tree, which the unit tests' mocked store can't exercise.
// (The empty-group case is pinned in SecondarySidebar's unit tests; seeding a
// second, template-less MCP server here would cost more than it proves.)
test('adds the templates group without disturbing the other three', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')

  for (const group of ['Tools', 'Resources', 'Resource Templates', 'Prompts']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${group}`) })).toBeVisible()
  }

  // Filtering must treat the new group like the rest: a query that matches only
  // a tool hides it, and one that matches only a template hides the others.
  const filter = page.getByPlaceholder('Filter tools, resources…')
  await filter.fill('echo')
  await expect(page.getByRole('button', { name: /^Resource Templates/ })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'echo', exact: true })).toBeVisible()

  await filter.fill('Dynamic Text')
  await expect(
    page.getByRole('button', { name: 'Dynamic Text Resource', exact: true })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /^Tools/ })).not.toBeVisible()

  // Clearing restores the full tree, the existing three groups included.
  await filter.fill('')
  await expect(page.getByRole('button', { name: /^Tools/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Prompts/ })).toBeVisible()
})

// A value that isn't a bare path segment has to survive the round trip: the
// preview is where the encoding becomes visible, and the server has to receive
// the decoded value back.
test('percent-encodes a template value rather than letting it add a path segment', async ({
  page
}) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')
  await page.getByRole('button', { name: 'Dynamic Text Resource', exact: true }).click()

  await page.getByRole('combobox', { name: 'resourceId', exact: true }).fill('1/2')
  await expect(page.getByTestId('expanded-uri')).toHaveText('mcpflo://dynamic/text/1%2F2')
})
