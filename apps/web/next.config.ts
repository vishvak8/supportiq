import type { NextConfig } from 'next';
import { config } from 'dotenv';
config({ path: '../../.env', quiet: true });
const apiHostport = process.env.SUPPORTIQ_API_HOSTPORT;
const apiOrigin =
  process.env.API_INTERNAL_URL ||
  (apiHostport ? `http://${apiHostport}` : 'http://127.0.0.1:4000');
const nextConfig: NextConfig = {
  // Keep isolated Playwright servers from contending with a developer's live
  // Next.js process and its .next/dev lock.
  distDir: process.env.SUPPORTIQ_NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  devIndicators: false,
  experimental: {
    // Render Free may wake the separate API service on the first request.
    // Allow its documented ~1-minute cold start plus a small safety margin.
    proxyTimeout: 135_000,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
