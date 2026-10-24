import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 8,
  timeout: 30000,
  use: {
    baseURL: process.env.APP_BASE_URL || 'http://127.0.0.1:4173/',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
  },
  reporter: 'list',
  webServer: process.env.APP_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://127.0.0.1:4173/', reuseExistingServer: true },
});
