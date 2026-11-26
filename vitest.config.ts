import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Unit tests only. Playwright specs live in e2e/ and run through
    // `npm run test:e2e`.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
})
