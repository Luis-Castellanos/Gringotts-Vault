/**
 * Demo mode. Set NEXT_PUBLIC_DEMO_MODE=1 on the *demo* Vercel deployment (which
 * points at a throwaway demo Neon database). It is read on the server, the edge
 * middleware, and the client (NEXT_PUBLIC_ is inlined at build), so the one flag
 * drives: skipping passkey auth, showing the demo banner, and enabling the
 * destructive reseed endpoint. The real deployment leaves it unset.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';
