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
  ENOTFOUND: 'host_not_found',
  CERT_HAS_EXPIRED: 'tls_certificate_invalid',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'tls_certificate_invalid',
  SELF_SIGNED_CERT_IN_CHAIN: 'tls_certificate_invalid',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls_certificate_invalid',
  ERR_TLS_CERT_ALTNAME_INVALID: 'tls_certificate_invalid',
  P1000: 'authentication_failed',
  P1001: 'connection_failed',
  P1002: 'connection_timeout',
  P1003: 'database_missing',
  P1010: 'permission_denied',
  P1011: 'tls_connection_failed',
  P1017: 'connection_closed',
};

/** Returns only a deliberately allowlisted error code and a stable category. */
export function databaseFailureDiagnostic(error: unknown): {
  category: string;
  code?: string;
} {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === 'object';
    depth++
  ) {
    const code = Reflect.get(current, 'code');
    if (typeof code === 'string' && SAFE_DATABASE_CODES[code])
      return { category: SAFE_DATABASE_CODES[code], code };
    current = Reflect.get(current, 'cause');
  }
  return { category: 'unknown' };
}
