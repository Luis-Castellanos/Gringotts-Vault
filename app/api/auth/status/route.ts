/** Auth status for the login page: is a passkey registered, and am I logged in? */

import { NextRequest, NextResponse } from 'next/server';

import { SESSION_COOKIE } from '@/lib/auth/config';
import { isValidSession } from '@/lib/auth/session';
import { ownerHasPasskey } from '@/lib/auth/webauthn';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const [authenticated, hasPasskey] = await Promise.all([
    isValidSession(req.cookies.get(SESSION_COOKIE)?.value),
    ownerHasPasskey(),
  ]);
  return NextResponse.json({ authenticated, hasPasskey });
}
