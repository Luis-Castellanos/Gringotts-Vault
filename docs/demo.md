# Demo deployment

A public, shareable demo of Vault — friends/coworkers open one URL and explore a
fully-populated app, **no passkey required**, with realistic sample data. It runs
as a **separate Vercel deployment** pointed at a **separate, throwaway Neon
database**, so it can never touch or expose your real finances.

```
Real deployment      → real Neon DB     → passkey-gated (your private data)
Demo deployment      → demo Neon DB      → DEMO_MODE=1, no auth, sample data
(same repo, same code; behavior differs only by env vars)
```

## How it works

- `NEXT_PUBLIC_DEMO_MODE=1` flips the deployment into demo mode (`lib/demo/mode.ts`).
- Middleware then **skips passkey auth** and bounces `/login` → `/` — visitors land straight in.
- A floating **"Live demo"** banner shows on every page with a **Reset demo data** button.
- Writes are allowed (visitors can play), and a **daily cron** + the reset button reseed the demo DB back to pristine sample data (`/api/demo/reset`, guarded by `DEMO_MODE` so it can never run on the real deployment).
- The desktop-only Upload page is hidden in the demo (the parser can't run on Vercel).

The sample data (`lib/demo/data.ts`) covers every feature: 15 accounts (banking, 4 credit cards with art + perks, brokerage/401k/Roth/HSA with holdings, a mortgage + escrow, two properties), ~14 months of categorized transactions with transfers, paystubs, a rental with a lease/maintenance/capex, goals, and a complete 2025 tax workspace (so Prepare/Plan are populated). Net worth lands around **$1.29M**.

## One-time setup

1. **Create a demo database on Neon** — either a new branch of your project or a brand-new project. Copy its connection string (the pooled `...-pooler...` URL).

2. **Create the schema + seed it** (locally, pointing at the demo DB):
   ```bash
   # in vault-app/, with the DEMO connection string:
   DATABASE_URL="postgres://…demo-db…" npm run db:push        # create all tables
   DATABASE_URL="postgres://…demo-db…" npm run db:seed-demo -- --force   # wipe + seed sample data
   ```
   `--force` is required because the seed wipes the target DB first — only ever point it at the demo DB.

3. **Create the demo Vercel project** from this same repo (or a second project linked to the repo) with these env vars:
   | Var | Value |
   |-----|-------|
   | `NEXT_PUBLIC_DEMO_MODE` | `1` |
   | `DATABASE_URL` | the **demo** Neon connection string |
   | `SESSION_SECRET` | any 32+ random chars (unused in demo, still imported) |
   | `RP_ID` | the demo domain, e.g. `vault-demo.vercel.app` |
   | `APP_ORIGIN` | `https://vault-demo.vercel.app` |

   Leave `NEXT_PUBLIC_DEMO_MODE` **unset** on your real deployment.

4. **Deploy.** Share the demo URL. The daily cron (`vercel.json`) reseeds it; the banner's button resets on demand.

## Refreshing the sample data

Re-run `npm run db:seed-demo -- --force` against the demo DB, or just hit **Reset demo data** in the banner (or `POST /api/demo/reset`). To change what's in the demo, edit `lib/demo/data.ts` and reseed.

## Safety notes

- The reseed endpoint and seed are no-ops / refuse to run unless they're clearly targeting the demo (`DEMO_MODE` for the route, `--force` for the CLI). They can't wipe your real DB through the app.
- Because it's a separate database, there is **no path** from the demo to your real financial data.
