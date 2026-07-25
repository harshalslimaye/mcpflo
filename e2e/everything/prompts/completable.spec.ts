import { test, expect, openEverythingGroup } from '../../fixtures'

// Exercises the full completion/complete path against the bundled Everything
// server's completable-prompt (packages/server-everything/src/prompts/
// completions.ts): department's own completer, and name's dependent
// completer, which only returns members once `context.arguments.department`
// carries a value — proving the renderer actually sends live sibling context,
// not just the typed value.
test('gets the Everything server\'s completable-prompt via typeahead completion', async ({
  page
}) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Prompts')

  await page.getByRole('button', { name: 'completable-prompt', exact: true }).click()

  const department = page.getByRole('combobox', { name: 'department', exact: true })
  await department.click()
  await department.fill('Eng')
  const departmentListbox = page.getByRole('listbox')
  await expect(
    departmentListbox.getByRole('option', { name: 'Engineering', exact: true })
  ).toBeVisible({ timeout: 10_000 })
  await department.press('ArrowDown')
  await department.press('Enter')
  await expect(department).toHaveValue('Engineering')

  // The pre-completion spec located fields by label (getByLabel), not role —
  // CompletionWidget must keep `aria-label={label || name}` on its <input>
  // (same as the plain-input fallback) so that older locator style still
  // resolves. A plain fill() through it here (re-asserting the same value)
  // guards against a regression that only the role-based locators used
  // elsewhere in this spec wouldn't catch.
  await page.getByLabel('department', { exact: true }).fill('Engineering')
  await expect(page.getByLabel('department', { exact: true })).toHaveValue('Engineering')

  // name's completer only returns members once context.arguments.department
  // carries a value (see completions.ts) — an empty value here still lists
  // every Engineering member, proving the department we just picked was sent
  // as live sibling context, not just name's own (empty) typed value.
  const name = page.getByRole('combobox', { name: 'name', exact: true })
  await name.click()
  const nameListbox = page.getByRole('listbox')
  await expect(nameListbox.getByRole('option')).toHaveCount(3, { timeout: 10_000 })
  await expect(nameListbox.getByRole('option')).toHaveText(['Alice', 'Bob', 'Charlie'])

  // Narrows to a single option, then selects it by mouse — the keyboard path
  // (department, above) and the click path both need coverage since
  // CompletionWidget wires them through separate handlers (onMouseDown vs
  // onKeyDown).
  await name.fill('Al')
  await expect(nameListbox.getByRole('option')).toHaveCount(1, { timeout: 10_000 })
  await nameListbox.getByRole('option', { name: 'Alice', exact: true }).click()
  await expect(name).toHaveValue('Alice')

  // The values picked via completion are ordinary form values — Get Prompt
  // must send them through exactly like hand-typed input.
  await page.getByRole('button', { name: 'Get Prompt', exact: true }).click()
  await expect(
    page.getByText('Please promote Alice to the head of the Engineering team.')
  ).toBeVisible({ timeout: 10_000 })

  // Changing department and re-fetching name's options (with name cleared
  // back to '', so the filter matches everyone again) must reflect the new
  // department, not a value stale from the Engineering-scoped cache entry —
  // the completion coordinator's cache key includes context, not just the
  // typed value (see completionCacheKey).
  await department.fill('Sales')
  await name.fill('')
  await expect(nameListbox.getByRole('option')).toHaveCount(3, { timeout: 10_000 })
  await expect(nameListbox.getByRole('option')).toHaveText(['David', 'Eve', 'Frank'])
})
