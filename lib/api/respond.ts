/**
 * Tiny helpers for API routes — keep response shapes consistent so the
 * frontend can rely on { data } | { error } discriminated unions everywhere.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export type ApiResponse<T> = { data: T } | { error: { code: string; message: string } };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Wraps a route handler with consistent error handling.
 * Catches ZodErrors → 400, anything else → 500 with a logged message.
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail('validation_error', err.message, 400);
      }
      console.error('[api] unexpected error:', err);
      return fail('internal_error', 'Something went wrong.', 500);
    }
  };
}
