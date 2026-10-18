import { expect, test } from '@jest/globals';
import { storageFailureDiagnostic } from '../dist/storage-diagnostics.js';

test('storage diagnostics allowlist S3 code and status without logging request secrets', () => {
  const error = Object.assign(
    new Error(
      'https://user:password@private.example/s3/bucket?X-Amz-Signature=signed private-file-content',
    ),
    {
      Code: 'SignatureDoesNotMatch',
      $metadata: { httpStatusCode: 403 },
    },
  );
  const diagnostic = storageFailureDiagnostic(error, {
    operation: 'put_object',
    endpoint:
      'https://user:password@abc123.storage.supabase.co/storage/v1/s3?secret=hidden',
    region: 'ap-northeast-2',
    bucket: 'supportiq-private',
    credentialsConfigured: true,
  });
  expect(diagnostic).toEqual({
    event: 'private_storage_operation_failed',
    operation: 'put_object',
    category: 'storage_signature_failed',
    code: 'SignatureDoesNotMatch',
    status: 403,
    endpointHost: 'abc123.storage.supabase.co',
    endpointUsesHttps: true,
    endpointPathMatchesSupabaseS3: true,
    endpointHasNoEmbeddedCredentialsOrQuery: false,
    region: 'ap-northeast-2',
    bucket: 'supportiq-private',
    credentialsConfigured: true,
  });
  const output = JSON.stringify(diagnostic);
  expect(output).not.toContain('password');
  expect(output).not.toContain('signed');
  expect(output).not.toContain('secret');
  expect(output).not.toContain('private-file-content');
  expect(output).not.toContain('X-Amz-Signature');
});

test('storage diagnostics extract allowlisted nested Supabase error code and status', () => {
  expect(
    storageFailureDiagnostic(
      new AggregateError([
        {
          name: 'S3Error',
          cause: {
            Code: 'DatabaseError',
            statusCode: 500,
            message: 'private database and file details',
          },
        },
      ]),
      {
        operation: 'head_bucket',
        endpoint: 'https://abc.storage.supabase.co/storage/v1/s3',
        region: 'ap-northeast-2',
        bucket: 'supportiq-private',
        credentialsConfigured: false,
      },
    ),
  ).toMatchObject({
    operation: 'head_bucket',
    category: 'storage_database_failed',
    code: 'DatabaseError',
    status: 500,
    credentialsConfigured: false,
  });
});

test('storage diagnostics discard unrecognized provider codes and exception messages', () => {
  const diagnostic = storageFailureDiagnostic(
    Object.assign(new Error('secret endpoint and private content'), {
      code: 'https://private.example/?token=secret',
      $metadata: { httpStatusCode: 500 },
    }),
    {
      operation: 'put_object',
      endpoint: 'not a url with credentials',
      region: 'ap-northeast-2',
      bucket: 'supportiq-private',
      credentialsConfigured: true,
    },
  );
  expect(diagnostic).toMatchObject({
    category: 'storage_service_failed',
    endpointHost: '[invalid]',
    status: 500,
    endpointPathMatchesSupabaseS3: false,
    endpointHasNoEmbeddedCredentialsOrQuery: false,
  });
  expect(JSON.stringify(diagnostic)).not.toContain('secret');
  expect(JSON.stringify(diagnostic)).not.toContain('private content');
  expect(JSON.stringify(diagnostic)).not.toContain('private endpoint');
});
