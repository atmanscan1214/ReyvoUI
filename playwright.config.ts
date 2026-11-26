import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright runs the real app: `webServer` boots the Vite dev server, and the
 * signed-in tests talk to the FastAPI backend on :8000.
 *
 * Override with PLAYWRIGHT_BASE_URL when the app is already running elsewhere.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 7000,
  },
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'Chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 90000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
