# Deploying Vault (Vercel + passkey auth + custom domain)

Vault hosts on **Vercel** (Next.js's native host). The only thing that can't run
there is the **PDF statement parser** (it spawns Python + poppler) — so uploads
stay a desktop-only capability. Everything else (all pages, the API, the Neon
database) runs fully hosted. The hosted `/upload` page shows a "run locally"
notice instead of a dropzone, and the upload/preview routes return 503; this is
automatic (`lib/parser/availability.ts` detects Vercel).

Auth is a **passkey** (WebAuthn) for the single owner — Face ID / Touch ID / a
security key, no password. First visit registers a passkey, then the app locks.

---

## 1. Push the repo to GitHub

Vault's repo is already on GitHub. Make sure `main` is pushed:

```bash
git push origin main
```

## 2. Create the Vercel project

1. Go to **vercel.com → Add New → Project**, sign in with GitHub.
2. Import the **vault-app** repo. Vercel auto-detects Next.js — leave build
   settings at the defaults (build `next build`, output `.next`).
3. **Before the first deploy**, add the environment variables below (Settings →
   Environment Variables, scope = Production + Preview).

## 3. Environment variables

| Variable         | Value                                                            | Notes |
|------------------|------------------------------------------------------------------|-------|
| `DATABASE_URL`   | your Neon connection string                                      | same one in local `.env` |
| `SESSION_SECRET` | a 32+ char random string                                         | generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `RP_ID`          | your domain, no scheme/port — e.g. `vault.yourdomain.com`        | must match the URL you actually visit |
| `APP_ORIGIN`     | full origin with scheme — e.g. `https://vault.yourdomain.com`    | comma-separate if more than one |

Optional (only if you use those features): `ANTHROPIC_API_KEY`,
`MARKET_DATA_KEY`, `NEXT_PUBLIC_LOGO_DEV_TOKEN`.

> **Passkeys are domain-bound.** `RP_ID` / `APP_ORIGIN` must match the hostname in
> the browser. Set them to your **custom domain** (step 5), not the
> `*.vercel.app` URL — otherwise a passkey created on the vercel.app URL won't
> work once you move to the real domain. If you want to test before the domain is
> live, temporarily set them to your `*.vercel.app` URL, then update + re-register.

## 4. Deploy

Click **Deploy**. First build takes a few minutes. When it's green, the app is at
`https://<project>.vercel.app` — but don't register a passkey yet if `RP_ID` is
still set to the final custom domain (it won't match). Do the domain first.

## 5. Buy + point a domain

You can buy the domain **through Vercel** (simplest — DNS auto-configures) or at
any registrar (Namecheap, Cloudflare, etc.) and point it.

**Through Vercel:** Project → Settings → Domains → search a name → buy. DNS is
configured automatically; TLS is issued in a minute or two.

**External registrar:** Project → Settings → Domains → add `vault.yourdomain.com`
→ Vercel shows a CNAME (subdomain) or A record (apex) to add at your registrar.
Add it, wait for propagation (minutes to an hour), TLS issues automatically.

After the domain resolves, confirm `RP_ID` = the domain and
`APP_ORIGIN` = `https://` + the domain, then **redeploy** so the new env is
picked up (Deployments → ⋯ → Redeploy).

## 6. First-run: register your passkey

1. Visit `https://vault.yourdomain.com` → middleware redirects to `/login`.
2. Since no passkey exists yet, you'll see **"Create passkey"**. Click it and
   complete the OS prompt (Face ID / Touch ID / security key).
3. You're in. Registration is now **locked** — `/api/auth/register/options`
   returns 403 once a passkey exists and you're not signed in, so no one else can
   self-register.
4. To add another device later (e.g. your phone): sign in on an existing device
   first, then visit `/login` again — registration is allowed while authenticated.

## 7. Uploading statements (desktop)

When you need to ingest new statement PDFs, run Vault locally on the PC where the
Python parser lives (`npm run dev`, then `/upload`). It writes to the same Neon
database, so the parsed transactions appear on the hosted app immediately. The
hosted `/upload` page links you here.

---

### Troubleshooting

- **"Sign-in failed" / passkey not offered** — `RP_ID`/`APP_ORIGIN` don't match
  the URL. Fix the env, redeploy, and (if you registered against the wrong
  origin) delete the stale row from `webauthn_credentials` and re-register.
- **Locked out (lost all passkeys)** — delete all rows from
  `webauthn_credentials` in Neon; the next visit re-enters first-run registration.
- **Upload returns 503 on the hosted app** — expected. Use the local desktop app.
