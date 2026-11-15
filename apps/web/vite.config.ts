import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { landingDocuments } from './build/landingDocuments.ts'

const backend = process.env.RUNOUT_SERVER_URL ?? 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), landingDocuments()],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/ws': { target: backend, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The browser tests in e2e/ run under Playwright (`pnpm test:e2e`).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
