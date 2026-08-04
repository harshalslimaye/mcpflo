import { test, expect, openEverythingGroup } from '../../fixtures'

// The Everything server's query-style template (mcpflo://dynamic/search{?q,limit}),
// the only one that isn't a simple `{var}` path substitution.
//
// This is what src/renderer/lib/uriTemplate.ts gave as its reason for parsing
// templates with the SDK's UriTemplate rather than a `/\{(\w+)\}/g` regex: a
// regex finds `{?q,limit}` unparseable as a variable name, or — worse — treats
// it as one variable called "?q,limit". Until this template existed no fixture
// server published anything that could tell the two implementations apart.
test('expands a query-style template into a query string', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')
  await page.getByRole('button', { name: 'Dynamic Search Result', exact: true }).click()

  // `{?q,limit}` declares two variables, so it's two fields — not one field
  // named "?q,limit", which is what a regex-based reader would produce here.
  const q = page.getByRole('combobox', { name: 'q', exact: true })
  const limit = page.getByRole('combobox', { name: 'limit', exact: true })
  await expect(q).toBeVisible()
  await expect(limit).toBeVisible()

  const preview = page.getByTestId('expanded-uri')
  await expect(preview).toHaveText('mcpflo://dynamic/search{?q,limit}')

  await q.fill('tools')
  await limit.fill('3')

  // `?q=…&limit=…`, with the operator's own separators — not the `/tools/3`
  // that plain substitution into the braces would give.
  await expect(preview).toHaveText('mcpflo://dynamic/search?q=tools&limit=3')

  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByText('Search for "tools": 3 of 42 matches')).toBeVisible({
    timeout: 10_000
  })
})

// A form-style value is encoded on the way out and has to be decoded on the way
// back in — UriTemplate.match() reverses the template's structure but not its
// percent-encoding. The round trip is only visible end to end: the preview
// shows the escape, the resource has to show the original.
test('round-trips a query value that needs encoding', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')
  await page.getByRole('button', { name: 'Dynamic Search Result', exact: true }).click()

  await page.getByRole('combobox', { name: 'q', exact: true }).fill('hello world')
  await page.getByRole('combobox', { name: 'limit', exact: true }).fill('1')
  await expect(page.getByTestId('expanded-uri')).toHaveText(
    'mcpflo://dynamic/search?q=hello%20world&limit=1'
  )

  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByText('Search for "hello world"')).toBeVisible({ timeout: 10_000 })
})

// Every variable of a completions-capable server's template gets the typeahead
// widget (buildResourceTemplateUiSchema assigns it by name, and the server
// never says which names it can actually complete). So the widget itself has to
// stay usable for a variable the server has nothing for — which no previous
// fixture template could check, since all their variables had completers.
test('stays typeable for a variable the server cannot complete', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')
  await page.getByRole('button', { name: 'Dynamic Search Result', exact: true }).click()

  // limit first: no completer behind it, so no dropdown — not an empty one,
  // and not an error row.
  const limit = page.getByRole('combobox', { name: 'limit', exact: true })
  await limit.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)

  // Typing still works normally, which is the actual requirement — completion
  // is advisory here, never a gate on the field.
  await limit.fill('2')
  await expect(limit).toHaveValue('2')

  // The sibling on the same template does have one, so the empty result above
  // is this variable's answer and not the whole template failing to complete.
  const q = page.getByRole('combobox', { name: 'q', exact: true })
  await q.click()
  await q.fill('t')
  const listbox = page.getByRole('listbox')
  await expect(listbox.getByRole('option')).toHaveCount(2, { timeout: 10_000 })
  await expect(listbox.getByRole('option')).toHaveText(['templates', 'tools'])

  await listbox.getByRole('option', { name: 'tools', exact: true }).click()
  await expect(page.getByTestId('expanded-uri')).toHaveText(
    'mcpflo://dynamic/search?q=tools&limit=2'
  )
})
