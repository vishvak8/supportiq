import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
config({ quiet: true });
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    !new URL(url).pathname.endsWith('_test') ||
    new URL(url).pathname ===
      new URL(process.env.DATABASE_URL || 'postgresql://localhost/unconfigured')
        .pathname
  )
    throw new Error('Refusing non-test database');
  const result = spawnSync('pnpm', ['db:seed'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SEED_PASSWORD: 'Synthetic-e2e-password!42',
    },
  });
  if (result.status !== 0) throw new Error('E2E seed failed');
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const { Database } = await import('../apps/api/dist/database.js');
  const db = new Database();
  process.env.DATABASE_URL = originalUrl;
  try {
    await db.rateLimit.deleteMany();
  } finally {
    await db.$disconnect();
  }
}
