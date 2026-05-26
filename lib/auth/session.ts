/**
 * Session + challenge tokens — jose-signed JWTs (HS256). Edge-safe (jose runs in
 * the middleware/edge runtime; no Node APIs), so middleware can verify sessions.
 *
 * Session: proves the owner authenticated (30-day cookie). Challenge: carries the
 * WebAuthn challenge between the options request and the verify request (5-min
 * cookie) — stored client-side signed so it survives serverless statelessness.
 */

import { SignJWT, jwtVerify } from 'jose';

import { SESSION_SECRET, SESSION_MAX_AGE } from './config';

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(SESSION_SECRET);
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return payload.role === 'owner';
  } catch {
    return false;
  }
}

export type ChallengeFlow = 'register' | 'login';

export async function createChallengeToken(challenge: string, flow: ChallengeFlow): Promise<string> {
  return new SignJWT({ challenge, flow })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(SESSION_SECRET);
}

export async function readChallengeToken(token: string | undefined, flow: ChallengeFlow): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    if (payload.flow !== flow || typeof payload.challenge !== 'string') return null;
    return payload.challenge;
  } catch {
    return null;
  }
}
