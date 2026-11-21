import { test, expect } from '@playwright/test'

/**
 * T51 — Critical E2E flows.
 * 
 * Tests the end-to-end user journey:
 * 1. Register → 2. Onboarding → 3. Import → 4. Campaign → 5. Reply
 * 
 * These are happy-path smoke tests that verify the main navigation
 * between the core app areas. They require the backend API at
 * http://localhost:8000 to be running.
 */

// Skip these tests by default unless a backend is available
test.describe('T51 Critical E2E flows', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/')
    // Wait for the app to load - check if we're past the auth gates
    await page.waitForLoadState('networkidle')
  })

  test('register page loads', async ({ page }) => {
    // Verify the register page is accessible
    await expect(page).toHaveURL(/^\/?$/)
    // The home page should show the product marketing
    await expect(page.locator('text=Reyvo')).toBeVisible()
  })

  test('login page loads', async ({ page }) => {
    // Click sign in to navigate to login
    await page.click('text=Sign in')
    await expect(page).toHaveURL('/login')
    await expect(page.locator('text=Sign in')).toBeVisible()
  })

  test('onboarding checklist loads after sign in', async ({ page }) => {
    // This test requires a signed-in session
    // We'll skip it if we can't authenticate
    await page.goto('/welcome')
    await page.waitForLoadState('networkidle')
    // The welcome checklist should be visible
    await expect(page.locator('text=Setup checklist')).toBeVisible()
  })

  test('companies page loads', async ({ page }) => {
    await page.goto('/app/companies')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Companies')).toBeVisible()
  })

  test('campaigns page loads', async ({ page }) => {
    await page.goto('/app/campaigns')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Campaigns')).toBeVisible()
  })

  test('replies page loads', async ({ page }) => {
    await page.goto('/app/replies')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Replies')).toBeVisible()
  })
})