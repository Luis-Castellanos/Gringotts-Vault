/** Finish passkey registration: verify the attestation, store it, start a session. */

import { NextRequest, NextResponse } from 'next/server';

import { CHALLENGE_COOKIE, SESSION_COOKIE } from '@/lib/auth/config';
import { isValidSession, createSessionToken, readChallengeToken } from '@/lib/auth/session';
import { clearChallengeCookie, setSessionCookie } from '@/lib/auth/cookies';
import { ownerHasPasskey, verifyRegistration } from '@/lib/auth/webauthn';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authenticated = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value);
  if ((await ownerHasPasskey()) && !authenticated) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const challenge = await readChallengeToken(req.cookies.get(CHALLENGE_COOKIE)?.value, 'register');
  if (!challenge) return NextResponse.json({ error: 'Challenge expired — try again.' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body?.response) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const ok = await verifyRegistration(body.response, challenge, typeof body.label === 'string' ? body.label : null);
  if (!ok) return NextResponse.json({ error: 'Registration could not be verified.' }, { status: 400 });

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, await createSessionToken());
  clearChallengeCookie(res);
  return res;
}
