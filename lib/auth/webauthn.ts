/**
 * WebAuthn (passkey) server logic for the single owner. Node-only (DB +
 * @simplewebauthn/server) — never imported by middleware. Credentials live in
 * `webauthn_credentials`; there's no user table (single-user app), so a fixed
 * owner identity is used. Public keys are stored base64url.
 */

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { webauthnCredentials } from '@/lib/db/schema';
import { APP_ORIGINS, RP_ID, RP_NAME } from './config';

const OWNER_USER_ID = new TextEncoder().encode('vault-owner');
const OWNER_USER_NAME = 'owner';

type Cred = typeof webauthnCredentials.$inferSelect;

function parseTransports(s: string | null): AuthenticatorTransportFuture[] {
  try {
    return s ? (JSON.parse(s) as AuthenticatorTransportFuture[]) : [];
  } catch {
    return [];
  }
}

async function listCredentials(): Promise<Cred[]> {
  return db.select().from(webauthnCredentials);
}

/** Whether the owner has registered any passkey yet (gates first-run registration). */
export async function ownerHasPasskey(): Promise<boolean> {
  const rows = await db.select({ id: webauthnCredentials.id }).from(webauthnCredentials).limit(1);
  return rows.length > 0;
}

export async function buildRegistrationOptions() {
  const creds = await listCredentials();
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: OWNER_USER_ID,
    userName: OWNER_USER_NAME,
    userDisplayName: 'Vault Owner',
    attestationType: 'none',
    excludeCredentials: creds.map((c) => ({ id: c.id, transports: parseTransports(c.transports) })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
}

export async function verifyRegistration(response: RegistrationResponseJSON, expectedChallenge: string, label: string | null): Promise<boolean> {
  let v;
  try {
    v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: APP_ORIGINS, expectedRPID: RP_ID });
  } catch {
    return false;
  }
  if (!v.verified || !v.registrationInfo) return false;
  const { credential } = v.registrationInfo;
  await db
    .insert(webauthnCredentials)
    .values({
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: JSON.stringify(response.response.transports ?? credential.transports ?? []),
      deviceLabel: label,
    })
    .onConflictDoNothing();
  return true;
}

export async function buildAuthenticationOptions() {
  const creds = await listCredentials();
  return generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: creds.map((c) => ({ id: c.id, transports: parseTransports(c.transports) })),
    userVerification: 'preferred',
  });
}

export async function verifyAuthentication(response: AuthenticationResponseJSON, expectedChallenge: string): Promise<boolean> {
  const [cred] = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.id, response.id)).limit(1);
  if (!cred) return false;
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: APP_ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id: cred.id,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64url')),
        counter: cred.counter,
        transports: parseTransports(cred.transports),
      },
    });
  } catch {
    return false;
  }
  if (!v.verified) return false;
  await db
    .update(webauthnCredentials)
    .set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.id, cred.id));
  return true;
}
