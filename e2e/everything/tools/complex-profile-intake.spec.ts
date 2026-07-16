import type { Page } from '@playwright/test'
import { test, expect, openEverythingGroup } from '../../fixtures'

// complex-profile-intake stress-tests the schema-driven Params form: nested
// objects (preferences), an array of objects (contactMethods), enums, booleans,
// and defaults. Each test drives the generated form and asserts on the tool's
// echoed summary lines, which restate exactly what the form submitted.

async function openTool(page: Page): Promise<void> {
  await openEverythingGroup(page, 'Tools')
  await page.getByRole('button', { name: 'complex-profile-intake', exact: true }).click()
  await expect(page.getByLabel('fullName', { exact: true })).toBeVisible()
}

// contactMethods has minItems: 1, which RJSF pre-populates with one empty item.
// Guarded rather than assumed so a future RJSF default-state change fails with
// a clear locator error instead of silently adding a second item.
async function ensureFirstContactItem(page: Page): Promise<void> {
  if ((await page.getByLabel('kind', { exact: true }).count()) === 0) {
    await contactsFieldset(page).getByRole('button', { name: 'Add item' }).click()
  }
}

function contactsFieldset(page: Page): ReturnType<Page['locator']> {
  return page.locator('fieldset').filter({ hasText: 'contactMethods' })
}

async function fillRequiredFields(page: Page): Promise<void> {
  await page.getByLabel('fullName', { exact: true }).fill('Ada Lovelace')
  await page.getByLabel('age', { exact: true }).fill('36')
  await page.getByLabel('primaryRole', { exact: true }).selectOption('engineer')
  await page.getByRole('switch', { name: 'acceptTerms' }).click()

  await ensureFirstContactItem(page)
  await page.getByLabel('kind', { exact: true }).first().selectOption('email')
  await page.getByLabel('value', { exact: true }).first().fill('ada@example.com')
}

test('submits required fields and echoes untouched nested defaults', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)
  await fillRequiredFields(page)
  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Profile: Ada Lovelace (36)')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Role: engineer')).toBeVisible()
  await expect(page.getByText('Accepted terms: true')).toBeVisible()
  await expect(page.getByText('Primary contact: email=ada@example.com')).toBeVisible()

  // The preferences card was never touched — its schema defaults must survive
  // the round trip.
  await expect(
    page.getByText('Theme: system | Notifications: true | Weekly hours: 40')
  ).toBeVisible()
  await expect(page.getByText('Favorite numbers: none')).toBeVisible()

  // Optional top-level fields left empty stay absent, not empty strings.
  await expect(page.getByText('Bio provided: false')).toBeVisible()
  await expect(page.getByText('Notes provided: false')).toBeVisible()
})

test('submits optional fields and a nested scalar array', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)
  await fillRequiredFields(page)

  await page.getByLabel('bio', { exact: true }).fill('Mathematician and first programmer.')
  await page.getByLabel('notes', { exact: true }).fill('Prefers analytical engines.')

  // favoriteNumbers lives inside the nested preferences card; its fieldset has
  // its own "Add item" button and unlabeled numeric item inputs.
  const favorites = page.locator('fieldset').filter({ hasText: 'favoriteNumbers' })
  await favorites.getByRole('button', { name: 'Add item' }).click()
  await favorites.getByRole('spinbutton').nth(0).fill('7')
  await favorites.getByRole('button', { name: 'Add item' }).click()
  await favorites.getByRole('spinbutton').nth(1).fill('42')

  await page.getByRole('button', { name: 'Execute', exact: true }).click()

  await expect(page.getByText('Favorite numbers: 7, 42')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Bio provided: true')).toBeVisible()
  await expect(page.getByText('Notes provided: true')).toBeVisible()
})

test('adds, flags, and removes contact methods, changing the primary contact', async ({ page }) => {
  test.setTimeout(60_000)

  await openTool(page)
  await fillRequiredFields(page)

  // Second contact method, marked primary — the tool picks the first
  // isPrimary=true entry over the earlier email one.
  await contactsFieldset(page).getByRole('button', { name: 'Add item' }).click()
  await page.getByLabel('kind', { exact: true }).nth(1).selectOption('phone')
  await page.getByLabel('value', { exact: true }).nth(1).fill('+15551234567')
  await page.getByRole('switch', { name: 'isPrimary' }).nth(1).click()

  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('Primary contact: phone=+15551234567')).toBeVisible({
    timeout: 10_000
  })

  // Removing the flagged item falls back to the first remaining contact.
  await page.getByRole('button', { name: 'Remove item' }).nth(1).click()
  await expect(page.getByText('contactMethods #2')).not.toBeVisible()

  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(page.getByText('Primary contact: email=ada@example.com')).toBeVisible({
    timeout: 10_000
  })
})
