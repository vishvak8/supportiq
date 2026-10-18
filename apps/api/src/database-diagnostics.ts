const SAFE_DATABASE_CODES: Readonly<Record<string, string>> = {
  // PostgreSQL SQLSTATEs and node-postgres/Node network errors.
  '08001': 'connection_failed',
  '08006': 'connection_failed',
  '28P01': 'authentication_failed',
  '3D000': 'database_missing',
  '42501': 'permission_denied',
  '53300': 'connection_capacity',
  '57P01': 'database_shutdown',
  ECONNREFUSED: 'connection_refused',
  ECONNRESET: 'connection_reset',
  ETIMEDOUT: 'connection_timeout',
  EHOSTUNREACH: 'host_unreachable',
  ENETUNREACH: 'host_unreachable',
  EAI_AGAIN: 'host_resolution_temporary_failure',
  ENOTFOUND: 'host_not_found',
  UNABLE_TO_GET_ISSUER_CERT: 'tls_certificate_invalid',
  UNABLE_TO_GET_CRL: 'tls_certificate_invalid',
  UNABLE_TO_DECRYPT_CERT_SIGNATURE: 'tls_certificate_invalid',
  UNABLE_TO_DECRYPT_CRL_SIGNATURE: 'tls_certificate_invalid',
  UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY: 'tls_certificate_invalid',
  CERT_SIGNATURE_FAILURE: 'tls_certificate_invalid',
  CRL_SIGNATURE_FAILURE: 'tls_certificate_invalid',
  CERT_NOT_YET_VALID: 'tls_certificate_invalid',
  CERT_HAS_EXPIRED: 'tls_certificate_invalid',
  CRL_NOT_YET_VALID: 'tls_certificate_invalid',
  CRL_HAS_EXPIRED: 'tls_certificate_invalid',
  ERROR_IN_CERT_NOT_BEFORE_FIELD: 'tls_certificate_invalid',
  ERROR_IN_CERT_NOT_AFTER_FIELD: 'tls_certificate_invalid',
  ERROR_IN_CRL_LAST_UPDATE_FIELD: 'tls_certificate_invalid',
  ERROR_IN_CRL_NEXT_UPDATE_FIELD: 'tls_certificate_invalid',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'tls_certificate_invalid',
  SELF_SIGNED_CERT_IN_CHAIN: 'tls_certificate_invalid',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls_certificate_invalid',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'tls_certificate_invalid',
  CERT_CHAIN_TOO_LONG: 'tls_certificate_invalid',
  CERT_REVOKED: 'tls_certificate_invalid',
  INVALID_CA: 'tls_certificate_invalid',
  INVALID_PURPOSE: 'tls_certificate_invalid',
  CERT_UNTRUSTED: 'tls_certificate_invalid',
  CERT_REJECTED: 'tls_certificate_invalid',
  HOSTNAME_MISMATCH: 'tls_certificate_invalid',
  ERR_TLS_CERT_ALTNAME_FORMAT: 'tls_certificate_invalid',
  ERR_TLS_CERT_ALTNAME_INVALID: 'tls_certificate_invalid',
  P1000: 'authentication_failed',
  P1001: 'connection_failed',
  P1002: 'connection_timeout',
  P1003: 'database_missing',
  P1010: 'permission_denied',
  P1011: 'tls_connection_failed',
  P1017: 'connection_closed',
};

const SAFE_ADAPTER_KINDS: Readonly<Record<string, string>> = {
  AuthenticationFailed: 'authentication_failed',
  ConnectionClosed: 'connection_closed',
  DatabaseAccessDenied: 'permission_denied',
  DatabaseDoesNotExist: 'database_missing',
  DatabaseNotReachable: 'connection_failed',
  SocketTimeout: 'connection_timeout',
  TlsConnectionError: 'tls_connection_failed',
  TooManyConnections: 'connection_capacity',
};

/** Returns only a deliberately allowlisted error code and a stable category. */
export function databaseFailureDiagnostic(error: unknown): {
  category: string;
  code?: string;
} {
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  let fallbackCategory: string | undefined;

  // Prisma may wrap adapter errors in `meta.driverAdapterError`; the adapter
  // itself puts a structured payload on DriverAdapterError.cause. pg can also
  // surface AggregateError.errors when DNS tries multiple addresses.
  for (let inspected = 0; pending.length > 0 && inspected < 24; inspected++) {
    const current = pending.shift();
    if (!current || typeof current !== 'object' || visited.has(current))
      continue;
    visited.add(current);

    for (const field of ['code', 'originalCode']) {
      const code = Reflect.get(current, field);
      if (typeof code === 'string' && SAFE_DATABASE_CODES[code])
        return { category: SAFE_DATABASE_CODES[code], code };
    }

    const kind = Reflect.get(current, 'kind');
    if (typeof kind === 'string' && SAFE_ADAPTER_KINDS[kind])
      fallbackCategory ||= SAFE_ADAPTER_KINDS[kind];

    const cause = Reflect.get(current, 'cause');
    if (cause && typeof cause === 'object') pending.push(cause);

    const errors = Reflect.get(current, 'errors');
    if (Array.isArray(errors)) pending.push(...errors.slice(0, 8));

    const meta = Reflect.get(current, 'meta');
    if (meta && typeof meta === 'object') {
      const adapterError = Reflect.get(meta, 'driverAdapterError');
      if (adapterError && typeof adapterError === 'object')
        pending.push(adapterError);
    }

    const adapterError = Reflect.get(current, 'driverAdapterError');
    if (adapterError && typeof adapterError === 'object')
      pending.push(adapterError);
  }
  return { category: fallbackCategory ?? 'unknown' };
}
