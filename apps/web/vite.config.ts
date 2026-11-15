import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { landingBudget } from './build/budget.ts'
import { preloadHeadlineFont } from './build/headlineFont.ts'
import { landingDocuments } from './build/landingDocuments.ts'

const backend = process.env.RUNOUT_SERVER_URL ?? 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  /*
   * The build asks ahead for the headline's font, writes the Landing into its documents, and fails when the
   * Landing passes its weight budget, which is weighed last of all, once the documents and every file are as written.
   */
  plugins: [react(), preloadHeadlineFont(), landingDocuments(), landingBudget()],
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
    // The tests in build/ build the app, and a build must be told where the site is.
    env: { VITE_SITE_URL: 'https://runout.test' },
  },
})
