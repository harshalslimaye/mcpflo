import { test, expect, openEverythingGroup } from '../../fixtures'

// The completion/complete path with a `ref/resource` reference, which until
// resource templates existed had no way to be reached from the UI — every
// completion the app had ever sent used `ref/prompt`. Mirrors the
// completable-prompt spec (e2e/everything/prompts/completable.spec.ts) on the
// other half of the ref union, against the Everything server's
// {resourceId} completer.
test('completes a resource template variable via typeahead', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')
  await page.getByRole('button', { name: 'Dynamic Text Resource', exact: true }).click()

  const resourceId = page.getByRole('combobox', { name: 'resourceId', exact: true })
  await resourceId.click()

  // An empty value lists every id the server has. This is what the completer
  // used to be unable to say: it echoed back whatever parsed as a positive
  // integer, so there was nothing here to assert.
  const listbox = page.getByRole('listbox')
  await expect(listbox.getByRole('option')).toHaveCount(5, { timeout: 10_000 })
  await expect(listbox.getByRole('option')).toHaveText(['1', '2', '3', '4', '5'])

  // Narrow, then select by mouse.
  await resourceId.fill('4')
  await expect(listbox.getByRole('option')).toHaveCount(1, { timeout: 10_000 })
  await listbox.getByRole('option', { name: '4', exact: true }).click()
  await expect(resourceId).toHaveValue('4')

  // A completed value is an ordinary form value: the preview resolves it and
  // the read goes through exactly as a hand-typed one would.
  await expect(page.getByTestId('expanded-uri')).toHaveText('mcpflo://dynamic/text/4')
  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByText('Resource 4:')).toBeVisible({ timeout: 10_000 })
})

// Completion is requested against the template the server published, not a URI
// it expanded to — the two templates share a variable name, so a ref carrying
// the wrong one would still return plausible-looking values. Asking the blob
// template proves the ref reaches the right registration.
test('completes against the blob template independently of the text one', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Resource Templates')
  await page.getByRole('button', { name: 'Dynamic Blob Resource', exact: true }).click()

  const resourceId = page.getByRole('combobox', { name: 'resourceId', exact: true })
  await resourceId.click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(5, { timeout: 10_000 })

  await resourceId.fill('2')
  await page.getByRole('listbox').getByRole('option', { name: '2', exact: true }).click()
  await expect(page.getByTestId('expanded-uri')).toHaveText('mcpflo://dynamic/blob/2')
})
