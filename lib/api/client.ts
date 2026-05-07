/**
 * Tiny client-side fetch wrapper. Mirrors the API's discriminated union
 * response shape so callers can pattern-match cleanly.
 */

export type ApiResult<T> = { data: T; error?: never } | { data?: never; error: { code: string; message: string } };

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as ApiResult<T>;
  return json;
}
