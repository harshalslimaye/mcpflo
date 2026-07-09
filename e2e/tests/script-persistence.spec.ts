import { test, expect, openEverythingGroup, fillTestScript } from '../fixtures'

test('a test script survives switching to another tool and back', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'echo', exact: true }).click()

  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  const script =
    'test("is not an error", function () {\n  expect(res.getIsError()).to.equal(false)\n})'
  await fillTestScript(page, script)

  // useTestScript.ts flushes on unmount even inside the 500ms autosave
  // debounce, so switching tools immediately (no wait) must still persist —
  // this is the regression that comment guards against.
  await page.getByRole('button', { name: 'get-sum', exact: true }).click()
  await page.getByRole('button', { name: 'echo', exact: true }).click()

  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await expect(page.locator('.cm-content')).toHaveText(script.replace(/\n/g, ''))
})
