export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  return apiMethod<T>(path, body === undefined ? 'GET' : 'POST', body);
}

export async function apiMethod<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const secure = await fetch('/api/auth/csrf', { cache: 'no-store' });
  if (!secure.ok) throw new Error('Unable to establish a secure connection');
  const csrf = (await secure.json()).token as string;
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'X-CSRF-Token': csrf,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      Array.isArray(data.message)
        ? data.message.join('; ')
        : data.message || 'Unable to complete this request',
    );
  return data as T;
}

export async function apiMultipart<T>(
  path: string,
  body: FormData,
): Promise<T> {
  const response = await fetch('/api/auth/csrf', { cache: 'no-store' });
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
      Array.isArray(data.message)
        ? data.message.join('; ')
        : data.message || 'Unable to complete this request',
    );
  return data as T;
}
