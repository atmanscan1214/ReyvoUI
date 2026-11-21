import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    test: [
      '<rootDir>/src/**/*.test.ts',
      '<rootDir>/src/**/*.spec.ts',
    ],
    exclude: [
      '<rootDir>/e2e/**',
      '<rootDir>/node_modules/**',
      '<rootDir>/my-react-app/**',
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
})