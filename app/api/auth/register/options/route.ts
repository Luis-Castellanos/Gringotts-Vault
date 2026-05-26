/**
 * Begin passkey registration. Allowed only on first run (no passkey yet) or when
 * already authenticated (adding another device) — once a passkey exists, a
 * stranger can't register a new one.
 */

import { NextRequest, NextResponse } from 'next/server';

import { SESSION_COOKIE } from '@/lib/auth/config';
import { isValidSession, createChallengeToken } from '@/lib/auth/session';
import { setChallengeCookie } from '@/lib/auth/cookies';
import { buildRegistrationOptions, ownerHasPasskey } from '@/lib/auth/webauthn';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authenticated = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value);
  const hasPasskey = await ownerHasPasskey();
  if (hasPasskey && !authenticated) {
    return NextResponse.json({ error: 'A passkey is already registered. Sign in first to add another device.' }, { status: 403 });
  }
  const options = await buildRegistrationOptions();
  const res = NextResponse.json(options);
  setChallengeCookie(res, await createChallengeToken(options.challenge, 'register'));
  return res;
}
