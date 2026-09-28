import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

// The test stack uses its own database (helpdesk_test), ports and env file. See server/.env.e2e.example.
const e2eEnv = parse(readFileSync(path.resolve(import.meta.dirname, 'server/.env.e2e')))

const serverPort = e2eEnv.PORT ?? '3001'
const clientPort = new URL(e2eEnv.CLIENT_URL ?? 'http://localhost:5174').port
const serverUrl = `http://localhost:${serverPort}`
const clientUrl = `http://localhost:${clientPort}`

export default defineConfig({
  testDir: './e2e/tests',
  // One shared database, so run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: clientUrl,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Recreates and seeds the test database, then starts the API against it.
      command: 'npm run e2e:db:reset && npx tsx server/src/index.ts',
      url: `${serverUrl}/api/health`,
      env: e2eEnv,
      // Never attach to a server that might be running against the dev database.
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -w client -- --port ${clientPort} --strictPort`,
      url: clientUrl,
      env: { API_PROXY_TARGET: serverUrl },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
