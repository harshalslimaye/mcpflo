import { test, expect, openEverythingGroup } from '../../fixtures'

// The Everything server's two-variable template
// (mcpflo://dynamic/report/{department}/{member}), which exists to reach the
// parts of the template panel a one-variable template structurally cannot: a
// form with more than one field, and a completer whose candidates come from a
// *sibling* variable rather than from the typed value alone.
//
// Mirrors the completable-prompt spec (e2e/everything/prompts/completable.spec
// .ts) on the other half of the completion ref union — same roster, same
// dependency, reached through `ref/resource` instead of `ref/prompt`. Until
// this template existed, ResourceTemplateRequestPanel's getContextArgs always
// had a single field to exclude and therefore always sent an empty context.
test('completes a template variable from its sibling variable', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')
  await page.getByRole('button', { name: 'Dynamic Team Report', exact: true }).click()

  const department = page.getByRole('combobox', { name: 'department', exact: true })
  const member = page.getByRole('combobox', { name: 'member', exact: true })
  await expect(department).toBeVisible()
  await expect(member).toBeVisible()

  // member first, deliberately: with no department filled in the server has
  // nothing to suggest, and zero suggestions render no dropdown at all. This
  // is the negative half of the proof — the positive one below would also pass
  // if the app were sending every member regardless of context.
  await member.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)

  await department.click()
  await department.fill('Sale')
  const listbox = page.getByRole('listbox')
  await expect(listbox.getByRole('option', { name: 'Sales', exact: true })).toBeVisible({
    timeout: 10_000
  })
  await listbox.getByRole('option', { name: 'Sales', exact: true }).click()
  await expect(department).toHaveValue('Sales')

  // Same field, same empty typed value as above — only the sibling changed. So
  // these three options can only have come from context.arguments.department
  // travelling with the request.
  await member.click()
  await expect(listbox.getByRole('option')).toHaveCount(3, { timeout: 10_000 })
  await expect(listbox.getByRole('option')).toHaveText(['David', 'Eve', 'Frank'])

  await listbox.getByRole('option', { name: 'Eve', exact: true }).click()
  await expect(member).toHaveValue('Eve')

  await expect(page.getByTestId('expanded-uri')).toHaveText('mcpflo://dynamic/report/Sales/Eve')
  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByText('Report for Eve of Sales:')).toBeVisible({ timeout: 10_000 })
})

// A template with two variables also drives the panel's partially-filled
// states, which one variable can only ever express as all-or-nothing.
test('refuses a partially filled template and names what is still missing', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')
  await page.getByRole('button', { name: 'Dynamic Team Report', exact: true }).click()

  const preview = page.getByTestId('expanded-uri')
  const read = page.getByRole('button', { name: 'Read', exact: true })

  // Nothing filled: the plural branch of expandTemplate's message, which the
  // one-variable templates can't produce.
  await expect(preview).toHaveText('mcpflo://dynamic/report/{department}/{member}')
  await expect(page.getByText('Missing values for department, member')).toBeVisible()
  await expect(read).toBeDisabled()

  // Half filled: still refused, and now naming only the field left over.
  await page.getByRole('combobox', { name: 'department', exact: true }).fill('Marketing')
  await expect(page.getByText('Missing a value for member')).toBeVisible()
  await expect(read).toBeDisabled()

  await page.getByRole('combobox', { name: 'member', exact: true }).fill('Grace')
  await expect(preview).toHaveText('mcpflo://dynamic/report/Marketing/Grace')
  await expect(read).toBeEnabled()
})

// History for a multi-variable template: the entries are keyed by the template,
// and re-selecting one has to restore *every* variable it ran with, not just
// the first.
test('restores both variables from a past read', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')
  await page.getByRole('button', { name: 'Dynamic Team Report', exact: true }).click()

  const department = page.getByRole('combobox', { name: 'department', exact: true })
  const member = page.getByRole('combobox', { name: 'member', exact: true })
  const read = page.getByRole('button', { name: 'Read', exact: true })

  await department.fill('Sales')
  await member.fill('Frank')
  await read.click()
  await expect(page.getByText('Report for Frank of Sales:')).toBeVisible({ timeout: 10_000 })

  await department.fill('Support')
  await member.fill('Kim')
  await read.click()
  await expect(page.getByText('Report for Kim of Support:')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: /This template/ }).click()
  const rail = page.locator('aside')
  await expect(rail.getByText('mcpflo://dynamic/report/Sales/Frank', { exact: true })).toBeVisible()
  await expect(rail.getByText('mcpflo://dynamic/report/Support/Kim', { exact: true })).toBeVisible()

  await rail.getByText('mcpflo://dynamic/report/Sales/Frank', { exact: true }).click()
  await expect(department).toHaveValue('Sales')
  await expect(member).toHaveValue('Frank')
})
