/** Cookie helpers for the auth routes — httpOnly, lax, secure in prod. */

import type { NextResponse } from 'next/server';

import { CHALLENGE_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE } from './config';

const SECURE = process.env.NODE_ENV === 'production';
const base = { httpOnly: true, sameSite: 'lax' as const, secure: SECURE, path: '/' };

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, { ...base, maxAge: SESSION_MAX_AGE });
}
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { ...base, maxAge: 0 });
}
export function setChallengeCookie(res: NextResponse, token: string) {
  res.cookies.set(CHALLENGE_COOKIE, token, { ...base, maxAge: 300 });
}
export function clearChallengeCookie(res: NextResponse) {
  res.cookies.set(CHALLENGE_COOKIE, '', { ...base, maxAge: 0 });
}
