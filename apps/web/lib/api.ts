export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let csrf: string | undefined;
  if (body !== undefined) {
    const response = await fetch('/api/auth/csrf', { cache: 'no-store' });
    if (!response.ok)
      throw new Error('Unable to establish a secure connection');
    csrf = (await response.json()).token;
  }
  const response = await fetch('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers:
      body === undefined
        ? {}
        : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf! },
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
