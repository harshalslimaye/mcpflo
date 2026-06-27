import { test, expect, openEverythingGroup } from '../../fixtures'

test('executes the Everything server\'s simulate-research-query tool', async ({ page }) => {
  test.setTimeout(60_000)

  await openEverythingGroup(page, 'Tools')

  await page.getByRole('button', { name: 'simulate-research-query', exact: true }).click()

  // `ambiguous` left at its default (false) — true would trigger an elicitation
  // request mid-run, which is its own, separate flow to cover.
  await page.getByLabel('topic', { exact: true }).fill('octopus cognition')
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.locator('p', { hasText: 'Executing…' })).toBeVisible()

  // This is a task-augmented (SEP-1686) tool call: the server reports four
  // working stages over ~4s before the task completes, so allow extra time.
  await expect(page.getByText('# Research Report: octopus cognition')).toBeVisible({
    timeout: 20_000
  })
  await expect(page.getByText('Stage 4: Generating report ✓')).toBeVisible()
})
