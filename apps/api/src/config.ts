import { config } from 'dotenv';
config({ path: '../../.env', quiet: true });
export function settings() {
  const secret = process.env.CSRF_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace-'))
    throw new Error('Set CSRF_SECRET to at least 32 random characters');
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  const production = process.env.NODE_ENV === 'production';
  if (
    new URL(origin).origin !== origin ||
    (production && !origin.startsWith('https://'))
  )
    throw new Error(
      'APP_ORIGIN must be an exact origin; HTTPS is required in production',
    );
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return {
    secret,
    origin,
    production,
    sessionName: production ? '__Host-siq_session' : 'siq_session',
    csrfName: production ? '__Host-siq_csrf' : 'siq_csrf',
  };
}
