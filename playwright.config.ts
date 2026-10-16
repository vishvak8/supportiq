import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
config({ quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith('_test') ||
  new URL(url).pathname ===
    new URL(process.env.DATABASE_URL || 'postgresql://localhost/unconfigured')
      .pathname
)
  throw new Error('E2E requires separate TEST_DATABASE_URL ending in _test');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: url,
  APP_ORIGIN: 'http://localhost:3100',
  API_PORT: '4100',
  API_INTERNAL_URL: 'http://127.0.0.1:4100',
} as Record<string, string>;
export default defineConfig({
  testDir: './apps/web/e2e',
  workers: 1,
  retries: 0,
  timeout: 30000,
  globalSetup: './scripts/e2e-setup.mjs',
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 1440, height: 1000 },
    trace: 'off',
  },
  // No traces: customer join tokens and session cookies must not enter artifacts.
  reporter: [['list']],
  webServer: [
    {
      command: 'pnpm --filter @supportiq/api start',
      url: 'http://127.0.0.1:4100/health/ready',
      env,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command:
        'pnpm --filter @supportiq/web exec next dev --hostname localhost --port 3100',
      url: 'http://localhost:3100/login',
      env,
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
