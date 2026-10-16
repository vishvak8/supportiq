import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
config({ quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith('_test') ||
  new URL(url).pathname ===
    new URL(process.env.DATABASE_URL || 'postgresql://localhost/unconfigured')
      .pathname
)
  throw new Error(
    'TEST_DATABASE_URL must target a separate database ending in _test',
  );
const result = spawnSync(
  'pnpm',
  ['--filter', '@supportiq/api', 'exec', 'prisma', 'migrate', 'deploy'],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
);
process.exit(result.status ?? 1);
