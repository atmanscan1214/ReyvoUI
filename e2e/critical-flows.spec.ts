import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

/**
 * T51 — critical end-to-end flows.
 *
 * Two groups:
 * - Public flows need only the frontend (started by playwright.config.ts).
 * - Signed-in flows also need the live API. They skip themselves with a clear
 *   message when http://127.0.0.1:8000/health is not reachable, so the suite
 *   stays usable without a backend.
 *
 * Credentials default to the seeded demo workspace and can be overridden with
 * E2E_EMAIL / E2E_PASSWORD (and E2E_API_URL).
 */

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000'
const EMAIL = process.env.E2E_EMAIL ?? 'demo@reyvo.com'
const PASSWORD = process.env.E2E_PASSWORD ?? 'ReyvoDemo123!'

async function apiIsUp(request: APIRequestContext) {
  try {
    const response = await request.get(`${API_URL}/health`, { timeout: 4000 })
    return response.ok()
  } catch {
    return false
  }
}

async function signIn(page: Page) {
  await page.goto('/login')
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/app(\/|$)/, { timeout: 20000 })
}

test.describe('public flows', () => {
  test('home page renders the marketing shell', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Reyvo/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('login page exposes the credential form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible()
  })

  test('protected areas redirect signed-out visitors to login', async ({ page }) => {
    await page.goto('/app/companies')
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
  })

  test('an invalid unsubscribe link explains itself', async ({ page }) => {
    await page.goto('/u/not-a-real-token')
    await expect(page.getByRole('heading', { name: /this link cannot be used/i })).toBeVisible({
      timeout: 15000,
    })
  })
})

test.describe('signed-in flows', () => {
  test.beforeEach(async ({ page, request }) => {
    const up = await apiIsUp(request)
    test.skip(!up, `backend API is not reachable at ${API_URL}`)
    await signIn(page)
  })

  test('dashboard loads the live summary', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /overview/i })).toBeVisible()
    await expect(page.getByText(/provider-accepted sends/i)).toBeVisible()
  })

  test('companies page lists live records', async ({ page }) => {
    await page.goto('/app/companies')
    await expect(page.getByRole('heading', { name: /^companies$/i })).toBeVisible()
    await expect(page.locator('table tbody tr').first()).toBeVisible()
  })

  test('contacts page lists live records', async ({ page }) => {
    await page.goto('/app/contacts')
    await expect(page.getByRole('heading', { name: /^contacts$/i })).toBeVisible()
    await expect(page.locator('table tbody tr').first()).toBeVisible()
  })

  test('campaign and reply areas load without a render error', async ({ page }) => {
    await page.goto('/app/campaigns')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.goto('/app/replies')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/something went wrong on this page/i)).toHaveCount(0)
  })

  test('data & privacy exports the workspace and guards deletion', async ({ page }) => {
    await page.goto('/app/settings/data')
    await expect(page.getByRole('heading', { name: /data & privacy/i })).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /download workspace archive/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^reyvo-workspace-\d{4}-\d{2}-\d{2}\.zip$/)

    await page.getByRole('button', { name: /^delete workspace$/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/30 days/i).first()).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^delete workspace$/i })).toBeDisabled()
    await dialog.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog).toHaveCount(0)
  })
})
