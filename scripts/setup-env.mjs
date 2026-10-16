import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('.env already exists; no changes made.');
} else {
  const env = readFileSync('.env.example', 'utf8')
    .replaceAll('local-db-password', randomBytes(24).toString('hex'))
    .replace(
      'replace-with-at-least-32-random-characters',
      randomBytes(32).toString('hex'),
    )
    .replace('replace-local-storage-password', randomBytes(24).toString('hex'))
    .replace(
      'choose-a-local-demo-password-at-least-12-characters',
      randomBytes(18).toString('base64url'),
    );
  writeFileSync('.env', env, { mode: 0o600, flag: 'wx' });
  console.log(
    'Created private local .env. Find your synthetic demo password in SEED_PASSWORD.',
  );
}
