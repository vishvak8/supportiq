import { config } from 'dotenv';
config({ path: '../../.env', quiet: true });
export function settings() {
  const secret = process.env.CSRF_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace-'))
    throw new Error('Set CSRF_SECRET to at least 32 random characters');
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  const production = process.env.NODE_ENV === 'production';
  const aiProvider = process.env.AI_PROVIDER || 'ollama';
  const mailMode = process.env.MAIL_MODE || (production ? '' : 'smtp');
  if (!['ollama', 'openai', 'gemini', 'disabled'].includes(aiProvider))
    throw new Error('AI_PROVIDER must be ollama, openai, gemini or disabled');
  if (!['smtp', 'disabled'].includes(mailMode))
    throw new Error('MAIL_MODE must be smtp or disabled');
  if (
    new URL(origin).origin !== origin ||
    (production && !origin.startsWith('https://'))
  )
    throw new Error(
      'APP_ORIGIN must be an exact origin; HTTPS is required in production',
    );
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (production) {
    if (aiProvider === 'openai' && !process.env.OPENAI_API_KEY)
      throw new Error('OPENAI_API_KEY is required for hosted AI in production');
    if (aiProvider === 'gemini' && !process.env.GEMINI_API_KEY)
      throw new Error('GEMINI_API_KEY is required for Gemini AI in production');
    if (!mailMode)
      throw new Error('Set MAIL_MODE=smtp or MAIL_MODE=disabled in production');
    if (
      mailMode === 'smtp' &&
      (!process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASSWORD ||
        !process.env.SMTP_FROM)
    )
      throw new Error(
        'SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM are required in production',
      );
    if (
      !process.env.STORAGE_ENDPOINT ||
      !process.env.STORAGE_ACCESS_KEY ||
      !process.env.STORAGE_SECRET_KEY ||
      !process.env.STORAGE_BUCKET
    )
      throw new Error(
        'Private S3-compatible storage credentials and bucket are required in production',
      );
  }
  return {
    secret,
    origin,
    production,
    aiProvider,
    mailMode,
    sessionName: production ? '__Host-siq_session' : 'siq_session',
    csrfName: production ? '__Host-siq_csrf' : 'siq_csrf',
  };
}
