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

test('database diagnostics unwrap Prisma driverAdapterError metadata', () => {
  const error = Object.assign(new Error('private adapter message'), {
    code: 'P2010',
    meta: {
      driverAdapterError: {
        cause: {
          kind: 'postgres',
          code: '28P01',
          message: 'postgresql://private-user:private-password@db.example/db',
        },
      },
    },
  });
  const diagnostic = databaseFailureDiagnostic(error);
  expect(diagnostic).toEqual({
    category: 'authentication_failed',
    code: '28P01',
  });
  expect(JSON.stringify(diagnostic)).not.toContain('private');
});

test('database diagnostics categorize Prisma PostgreSQL adapter payload kinds', () => {
  expect(
    databaseFailureDiagnostic({
      name: 'DriverAdapterError',
      cause: { kind: 'DatabaseNotReachable', host: 'private-host.example' },
    }),
  ).toEqual({ category: 'connection_failed' });
  expect(
    databaseFailureDiagnostic({
      meta: {
        driverAdapterError: {
          cause: { kind: 'TlsConnectionError', reason: 'private TLS detail' },
        },
      },
    }),
  ).toEqual({ category: 'tls_connection_failed' });
});

test('database diagnostics preserve only allowlisted node-postgres TLS codes', () => {
  const error = Object.assign(
    new Error('certificate details and host name must remain private'),
    { code: 'ERR_TLS_CERT_ALTNAME_INVALID' },
  );
  const diagnostic = databaseFailureDiagnostic(error);
  expect(diagnostic).toEqual({
    category: 'tls_certificate_invalid',
    code: 'ERR_TLS_CERT_ALTNAME_INVALID',
  });
  expect(JSON.stringify(diagnostic)).not.toContain('private');
});

test('database diagnostics inspect AggregateError members with bounded safe output', () => {
  const error = new AggregateError(
    [
      Object.assign(new Error('private resolver detail'), {
        code: 'ENOTFOUND',
        syscall: 'getaddrinfo',
        hostname: 'private-host.example',
      }),
    ],
    'private aggregate message',
  );
  expect(databaseFailureDiagnostic(error)).toEqual({
    category: 'host_not_found',
    code: 'ENOTFOUND',
  });
});
