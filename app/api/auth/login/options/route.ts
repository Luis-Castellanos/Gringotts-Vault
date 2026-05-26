/** Begin passkey sign-in: issue an authentication challenge. */

import { NextResponse } from 'next/server';

import { createChallengeToken } from '@/lib/auth/session';
import { setChallengeCookie } from '@/lib/auth/cookies';
import { buildAuthenticationOptions } from '@/lib/auth/webauthn';

export const runtime = 'nodejs';

export async function POST() {
  const options = await buildAuthenticationOptions();
  const res = NextResponse.json(options);
  setChallengeCookie(res, await createChallengeToken(options.challenge, 'login'));
  return res;
}
