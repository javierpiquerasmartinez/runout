import { defineConfig, devices } from '@playwright/test'
import { BUILT_PORT, BUILT_URL, SERVER_PORT, SERVER_URL, WEB_PORT } from './e2e/seeded'

/*
 * Browser tests: what jsdom can't check, such as whether the replayer's table
 * fits the screen without its pieces overlapping. Playwright starts its own
 * server (a throwaway Postgres, in Test mode) and its own Vite, on ports of
 * their own, so a `pnpm dev` already running is left alone. See the README.
 *
 * The Landing's documents exist only once the app is built, so it is built
 * too and served as it is deployed, on a third port, in front of the same
 * server.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/seed.ts',
  // One Account (Tester A) runs every test; one at a time keeps it simple.
  workers: 1,
  timeout: 5 * 60_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    // A browser that asks for English is taken from `/` to the Landing in English: the tests read Spanish.
    locale: 'es-ES',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @runout/server e2e:stack',
      url: `${SERVER_URL}/api/health`,
      env: { PORT: String(SERVER_PORT) },
      timeout: 180_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      command: `vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: {
        RUNOUT_SERVER_URL: SERVER_URL,
        VITE_DEV_SIGN_IN: 'true',
        // No Google button: Test mode is the way in, and nothing leaves the machine.
        VITE_GOOGLE_CLIENT_ID: '',
      },
      reuseExistingServer: false,
    },
    {
      command: `pnpm build && vite preview --host 127.0.0.1 --port ${BUILT_PORT} --strictPort`,
      url: BUILT_URL,
      // A build must be told the site's address; the tests open it where it is served, not there.
      env: { RUNOUT_SERVER_URL: SERVER_URL, VITE_GOOGLE_CLIENT_ID: '', VITE_SITE_URL: 'https://runout.test' },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
})
