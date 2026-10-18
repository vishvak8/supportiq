import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { databaseFailureDiagnostic } from '../src/database-diagnostics.js';

config({ path: '../../.env', quiet: true });

async function readHiddenConnectionString(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode)
    throw new Error('Run this diagnostic in an interactive terminal.');

  process.stderr.write(
    'Paste the runtime DATABASE_URL (hidden input; nothing will be echoed): ',
  );
  process.stdin.setRawMode(true);
  process.stdin.resume();

  try {
    return await new Promise((resolve, reject) => {
      let value = '';
      const onData = (chunk: Buffer) => {
        for (const character of chunk.toString('utf8')) {
          if (character === '\u0003') {
            process.stdin.off('data', onData);
            reject(new Error('Diagnostic cancelled.'));
            return;
          }
          if (character === '\r' || character === '\n') {
            process.stdin.off('data', onData);
            process.stderr.write('\n');
            resolve(value);
            return;
          }
          if (character === '\u007f' || character === '\b')
            value = value.slice(0, -1);
          else if (value.length < 4096) value += character;
        }
      };
      process.stdin.on('data', onData);
    });
  } finally {
    process.stdin.setRawMode(false);
  }
}

const connectionString =
  process.env.DATABASE_URL || (await readHiddenConnectionString());
let parsedUrl: URL | undefined;
try {
  parsedUrl = new URL(connectionString);
} catch {
  // URL parser errors can include the full input, so keep this response fixed.
}
if (!parsedUrl || !['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
  process.stderr.write(
    'Database diagnostic failed: invalid connection format.\n',
  );
  process.exit(2);
}
const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const sslMode = parsedUrl.searchParams.get('sslmode');
if (
  !localHosts.has(parsedUrl.hostname) &&
  !['require', 'verify-ca', 'verify-full'].includes(sslMode ?? '')
) {
  process.stderr.write(
    'Database diagnostic refused: hosted URLs must require TLS verification.\n',
  );
  process.exit(2);
}

let client: PrismaClient | undefined;
try {
  client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  await client.$queryRaw`SELECT 1`;
  process.stdout.write(
    'Runtime database connection succeeded (read-only SELECT 1).\n',
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      event: 'runtime_database_check_failed',
      ...databaseFailureDiagnostic(error),
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  if (client) await client.$disconnect().catch(() => {});
}
