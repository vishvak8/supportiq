import { expect, test } from '@jest/globals';
import { databaseFailureDiagnostic } from '../dist/database-diagnostics.js';

test('database diagnostics return allowlisted codes and omit messages', () => {
  const error = Object.assign(
    new Error('postgresql://private-user:private-password@db.example/private'),
    { code: '28P01' },
  );
  expect(databaseFailureDiagnostic(error)).toEqual({
    category: 'authentication_failed',
    code: '28P01',
  });
  expect(JSON.stringify(databaseFailureDiagnostic(error))).not.toContain(
    'private',
  );
});

test('database diagnostics inspect wrapped causes without exposing unknown codes', () => {
  expect(
    databaseFailureDiagnostic({
      code: 'not-safe-to-log',
      cause: Object.assign(new Error('private detail'), { code: 'ETIMEDOUT' }),
    }),
  ).toEqual({ category: 'connection_timeout', code: 'ETIMEDOUT' });
  expect(
    databaseFailureDiagnostic(
      Object.assign(new Error('private detail'), {
        code: 'private-hostname.example',
      }),
    ),
  ).toEqual({ category: 'unknown' });
});
