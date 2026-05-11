import { defineConfig } from '@playwright/test'

const liveBaseUrl = process.env.DASHBOARD_BASE || process.env.HOST || 'http://140.238.90.95'

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: liveBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
})
