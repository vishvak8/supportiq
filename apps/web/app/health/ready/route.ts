import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const hostport = process.env.SUPPORTIQ_API_HOSTPORT;
  const apiOrigin =
    process.env.API_INTERNAL_URL ||
    (hostport ? `http://${hostport}` : 'http://127.0.0.1:4000');
  try {
    const response = await fetch(`${apiOrigin}/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error('API readiness check failed');
    return NextResponse.json(
      { status: 'ready' },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return NextResponse.json(
      { status: 'unavailable' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
