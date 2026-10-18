import { spawnSync } from 'node:child_process';

const connection = process.env.MIGRATION_DATABASE_URL;
if (!connection) {
  process.stderr.write(
    'MIGRATION_DATABASE_URL is required for release migrations.\n',
  );
  process.exit(1);
}

const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['--filter', '@supportiq/api', 'db:migrate'],
  {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: connection },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
