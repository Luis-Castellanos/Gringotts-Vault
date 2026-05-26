/**
 * Auth configuration (Phase 3 — passkey login for the single owner). Values come
 * from env so dev (localhost) and prod (the real domain) differ without code
 * changes. Edge-safe: no Node-only imports here, so middleware can use it.
 *
 *   RP_ID         WebAuthn Relying Party ID = the site's domain, no scheme/port
 *                 (dev: "localhost"; prod: "vault.example.com").
 *   APP_ORIGIN    Expected origin(s), comma-separated, incl. scheme
 *                 (dev: "http://localhost:3000"; prod: "https://vault.example.com").
 *   SESSION_SECRET 32+ random chars — signs the session + challenge JWTs.
 */

export const RP_ID = process.env.RP_ID || 'localhost';
export const RP_NAME = 'Vault';
export const APP_ORIGINS = (process.env.APP_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const SESSION_COOKIE = 'vault_session';
export const CHALLENGE_COOKIE = 'vault_challenge';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const rawSecret = process.env.SESSION_SECRET || 'dev-insecure-session-secret-change-me-0000';
/** True when running on the built-in dev fallback secret (never use in prod). */
export const USING_DEV_SECRET = !process.env.SESSION_SECRET;
export const SESSION_SECRET = new TextEncoder().encode(rawSecret);
