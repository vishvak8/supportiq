export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const wakeRetryDelays = [0, 2000, 6000, 15000, 30000, 45000];

async function fetchRead(url: string, init?: RequestInit) {
  let lastError: unknown;
  for (let attempt = 0; attempt < wakeRetryDelays.length; attempt++) {
    const delay = wakeRetryDelays[attempt] || 0;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(url, init);
      if (![502, 503, 504].includes(response.status)) return response;
      await response.body?.cancel();
      lastError = new Error('Support services are waking after idle');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Support services are temporarily unavailable');
}

function messageForFailure(status: number, message: string) {
  if (status === 429)
    return (
      message || 'The free demo limit was reached. Please try again later.'
    );
  if ([502, 503, 504].includes(status))
    return 'Support services are waking or temporarily busy. Retry in a moment. If you were generating a draft, check whether it appeared before trying again.';
  return message || 'Unable to complete this request';
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  return apiMethod<T>(path, body === undefined ? 'GET' : 'POST', body);
}

export async function apiMethod<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const secure = await fetchRead('/api/auth/csrf', { cache: 'no-store' });
  if (!secure.ok) throw new Error('Unable to establish a secure connection');
  const csrf = (await secure.json()).token as string;
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'X-CSRF-Token': csrf,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const response =
    method === 'GET'
      ? await fetchRead('/api' + path, init)
      : await fetch('/api' + path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      messageForFailure(
        response.status,
        Array.isArray(data.message)
          ? data.message.join('; ')
          : data.message || '',
      ),
    );
  return data as T;
}

export async function apiMultipart<T>(
  path: string,
  body: FormData,
): Promise<T> {
  const response = await fetchRead('/api/auth/csrf', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to establish a secure connection');
  const csrf = (await response.json()).token as string;
  const result = await fetch('/api' + path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'X-CSRF-Token': csrf },
    body,
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok)
    throw new ApiError(
      result.status,
      messageForFailure(
        result.status,
        Array.isArray(data.message)
          ? data.message.join('; ')
          : data.message || '',
      ),
    );
  return data as T;
}
