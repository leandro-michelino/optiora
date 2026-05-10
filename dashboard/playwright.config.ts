import path from 'node:path'
import { defineConfig } from '@playwright/test'

const rootDir = path.resolve(__dirname, '..')
const e2eDatabasePath = path.join(rootDir, '.tmp', 'optiora-e2e.db')

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: './scripts/playwright-backend.sh',
      cwd: __dirname,
      url: 'http://127.0.0.1:8000/health',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ENABLE_AUTH: 'false',
        ENVIRONMENT: 'test',
        REQUIRE_LIVE_PROVIDER_DATA: 'false',
        DATABASE_URL: `sqlite:///${e2eDatabasePath}`,
        SECRET_KEY: 'optiora-e2e-secret-key',
      },
    },
    {
      command: './scripts/playwright-frontend.sh',
      cwd: __dirname,
      url: 'http://127.0.0.1:3000/dashboard/settings',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8000',
        NEXT_PUBLIC_ENABLE_AUTH: 'false',
      },
    },
  ],
})
