import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiMethod } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('API wake-up handling', () => {
  it('retries safe reads after a transient service wake response', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'csrf' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'synthetic-user' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = apiMethod<{ id: string }>('/auth/me', 'GET');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toEqual({ id: 'synthetic-user' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry writes when the proxy response is ambiguous', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'csrf' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiMethod('/tickets', 'POST', { subject: 'Synthetic issue' }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('check whether it appeared'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
