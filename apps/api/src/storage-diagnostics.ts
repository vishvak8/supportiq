const safeCodes = new Set([
  'AccessDenied',
  'DatabaseError',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'EntityTooLarge',
  'FeatureNotEnabled',
  'InternalError',
  'InvalidAccessKeyId',
  'InvalidBucketName',
  'InvalidChecksum',
  'InvalidParameter',
  'InvalidRequest',
  'MissingContentLength',
  'NoSuchBucket',
  'NotFound',
  'S3InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'SlowDown',
  'TimeoutError',
  'NetworkingError',
  'ETIMEDOUT',
]);

function errorNodes(error: unknown) {
  const pending = [error];
  const visited = new Set<object>();
  const result: Record<string, unknown>[] = [];
  while (pending.length && result.length < 12) {
    const current = pending.shift();
    if (!current || typeof current !== 'object' || visited.has(current))
      continue;
    visited.add(current);
    const node = current as Record<string, unknown>;
    result.push(node);
    pending.push(node.cause, node.originalError);
    if (Array.isArray(node.errors)) pending.push(...node.errors.slice(0, 8));
  }
  return result;
}

function safeEndpointConfiguration(endpoint: string | undefined) {
  if (!endpoint) return undefined;
  try {
    const url = new URL(endpoint);
    return {
      host: url.hostname,
      usesHttps: url.protocol === 'https:',
      pathMatchesSupabaseS3: url.pathname
        .replace(/\/$/, '')
        .endsWith('/storage/v1/s3'),
      hasNoEmbeddedCredentialsOrQuery:
        !url.username && !url.password && !url.search && !url.hash,
    };
  } catch {
    return {
      host: '[invalid]',
      usesHttps: false,
      pathMatchesSupabaseS3: false,
      hasNoEmbeddedCredentialsOrQuery: false,
    };
  }
}

export function storageFailureDiagnostic(
  error: unknown,
  configuration: {
    operation: string;
    endpoint?: string;
    region: string;
    bucket: string;
    credentialsConfigured: boolean;
  },
) {
  const nodes = errorNodes(error);
  const endpoint = safeEndpointConfiguration(configuration.endpoint);
  const code = nodes
    .map((node) => node.Code ?? node.code ?? node.name)
    .find(
      (value): value is string =>
        typeof value === 'string' && safeCodes.has(value),
    );
  const status = nodes
    .map((node) => {
      const metadata = node.$metadata as
        { httpStatusCode?: unknown } | undefined;
      return metadata?.httpStatusCode ?? node.statusCode;
    })
    .find(
      (value): value is number =>
        typeof value === 'number' && value >= 100 && value <= 599,
    );

  let category = 'unknown';
  if (
    code === 'InvalidAccessKeyId' ||
    code === 'S3InvalidAccessKeyId' ||
    code === 'AccessDenied'
  )
    category = 'storage_authentication_failed';
  else if (code === 'SignatureDoesNotMatch')
    category = 'storage_signature_failed';
  else if (code === 'NoSuchBucket' || code === 'NotFound')
    category = 'storage_bucket_not_found';
  else if (code === 'FeatureNotEnabled')
    category = 'storage_s3_api_not_enabled';
  else if (code === 'DatabaseError') category = 'storage_database_failed';
  else if (code === 'EntityTooLarge') category = 'storage_limit_exceeded';
  else if (code === 'InvalidChecksum') category = 'storage_checksum_failed';
  else if (code === 'SlowDown') category = 'storage_rate_limited';
  else if (
    code === 'InternalError' ||
    status === 500 ||
    status === 502 ||
    status === 503
  )
    category = 'storage_service_failed';
  else if (status === 401 || status === 403)
    category = 'storage_authentication_failed';
  else if (status === 404) category = 'storage_bucket_or_object_not_found';
  else if (status && status >= 400) category = 'storage_request_rejected';

  return {
    event: 'private_storage_operation_failed',
    operation: configuration.operation,
    category,
    ...(code ? { code } : {}),
    ...(status ? { status } : {}),
    endpointHost: endpoint?.host ?? 'aws-default',
    endpointUsesHttps: endpoint?.usesHttps,
    endpointPathMatchesSupabaseS3: endpoint?.pathMatchesSupabaseS3,
    endpointHasNoEmbeddedCredentialsOrQuery:
      endpoint?.hasNoEmbeddedCredentialsOrQuery,
    region: configuration.region,
    bucket: configuration.bucket,
    credentialsConfigured: configuration.credentialsConfigured,
  };
}
