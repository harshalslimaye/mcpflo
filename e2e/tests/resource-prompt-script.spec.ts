import { test, expect, openEverythingGroup, fillTestScript } from '../fixtures'

test('runs a resource read against its saved test script', async ({ page, electronApp }) => {
  test.setTimeout(60_000)

  // See tool-run-script.spec.ts: the default window is too narrow for the
  // Response panel's full tab row.
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1400, 800)
  })

  await openEverythingGroup(page, 'Resources')
  await page.getByRole('button', { name: 'architecture.md', exact: true }).click()

  // A resource's Request panel has only Details/Tests; the Response panel
  // has its own separate Tests tab too (only gains a "(n)" suffix once a
  // run has happened), so this is the first of the two on the page.
  await page.getByRole('button', { name: 'Tests', exact: true }).first().click()
  await fillTestScript(
    page,
    'test("reads as text", function () {\n  expect(res.getText()).to.include("Everything Server")\n})'
  )
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Details', exact: true }).click()
  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByText('# Everything Server – Architecture')).toBeVisible({
    timeout: 10_000
  })

  const responseTestsTab = page.getByRole('button', { name: /^Tests \(1\)/ })
  await expect(responseTestsTab).toBeVisible({ timeout: 10_000 })
  await responseTestsTab.click()
  await expect(page.getByText('Passed: 1')).toBeVisible()
})

test('gets a prompt against its saved test script', async ({ page, electronApp }) => {
  test.setTimeout(60_000)

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1400, 800)
  })

  await openEverythingGroup(page, 'Prompts')
  await page.getByRole('button', { name: 'simple-prompt', exact: true }).click()

  await page
    .getByRole('button', { name: /^Tests/ })
    .first()
    .click()
  await fillTestScript(
    page,
    'test("has a message", function () {\n  expect(res.getText()).to.equal("This is a simple prompt without arguments.")\n})'
  )
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Params', exact: true }).click()
  await page.getByRole('button', { name: 'Get Prompt', exact: true }).click()
  await expect(page.getByText('This is a simple prompt without arguments.')).toBeVisible({
    timeout: 10_000
  })

  const responseTestsTab = page.getByRole('button', { name: /^Tests \(1\)/ })
  await expect(responseTestsTab).toBeVisible({ timeout: 10_000 })
  await responseTestsTab.click()
  await expect(page.getByText('Passed: 1')).toBeVisible()
})
