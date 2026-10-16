import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
config({ quiet: true });
const url = process.env.TEST_DATABASE_URL;
const liveOllama = process.env.SUPPORTIQ_LIVE_OLLAMA === '1';
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
  SUPPORTIQ_NEXT_DIST_DIR: '.next-e2e',
  SMTP_HOST: process.env.SMTP_HOST || '127.0.0.1',
  SMTP_PORT: process.env.SMTP_PORT || '1025',
  SMTP_FROM: process.env.SMTP_FROM || 'SupportIQ <support@localhost>',
  OLLAMA_URL: liveOllama
    ? process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
    : 'http://127.0.0.1:4141',
  OLLAMA_EMBEDDING_MODEL: liveOllama
    ? process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text:latest'
    : 'deterministic-test-embedding',
  OLLAMA_CHAT_MODEL: liveOllama
    ? process.env.OLLAMA_CHAT_MODEL || 'llama3.1:8b'
    : 'deterministic-test-chat',
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
    ...(!liveOllama
      ? [
          {
            command: 'node apps/api/test/mock-ollama.mjs',
            url: 'http://127.0.0.1:4141/health',
            env,
            reuseExistingServer: false,
            timeout: 10000,
          },
        ]
      : []),
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
