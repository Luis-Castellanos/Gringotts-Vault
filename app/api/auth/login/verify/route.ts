/** Finish passkey sign-in: verify the assertion, start a session. */

import { NextRequest, NextResponse } from 'next/server';

import { CHALLENGE_COOKIE } from '@/lib/auth/config';
import { createSessionToken, readChallengeToken } from '@/lib/auth/session';
import { clearChallengeCookie, setSessionCookie } from '@/lib/auth/cookies';
import { verifyAuthentication } from '@/lib/auth/webauthn';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const challenge = await readChallengeToken(req.cookies.get(CHALLENGE_COOKIE)?.value, 'login');
  if (!challenge) return NextResponse.json({ error: 'Challenge expired — try again.' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body?.response) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const ok = await verifyAuthentication(body.response, challenge);
  if (!ok) return NextResponse.json({ error: 'Sign-in could not be verified.' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, await createSessionToken());
  clearChallengeCookie(res);
  return res;
}
