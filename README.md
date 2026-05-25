# Gringotts Vault

Personal finance app. Audience of one. Long-term build, not a sprint.

## Status

- ✅ Schema + Drizzle ORM with full TypeScript inference; Neon Postgres
- ✅ **In-app ingestion pipeline** — the parser lives in `parser/`, uploads parse
  and write straight to Neon, original PDFs stored as `bytea`. `master.xlsx` is
  retired as the source of truth (export-only). See ROADMAP "Data pipeline".
- ✅ **Statement audit capture** — the parser also extracts each statement's stated
  control totals (begin/end balance, deposit/withdrawal totals) + per-row running
  balance, so statements can be reconciled stated-vs-derived (`imports` +
  `transactions.balance`).
- ✅ Pages shipped: Review Queue, Transactions, Cashflow, Net Worth, Accounts,
  Credit Cards, Categories, **Payroll** (paystub-driven), **Upload**, **Files**,
  **Settings**, **Transfers** (recon)
- ✅ Vendor-map + Claude (Anthropic API) categorization; customizable Excel export
- 🟡 Dashboard, deeper reporting, investment/holdings model — todo
- 🟡 **Statement audit page** (Valid8-style timeline + reconciliation) — data
  captured, page todo
- 🟡 Auth — none yet, audience of one

## Stack

- **Database:** Postgres on Neon (shared between dev machines via the same `DATABASE_URL`)
- **ORM:** Drizzle
- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS v4 with CSS-first design tokens
- **Validation:** Zod
- **Hosting:** Vercel (when ready)

The whole stack is intentionally explicit. API routes return `{ data } | { error }`
discriminated unions; the frontend has a tiny `api()` helper that pattern-matches
on those. Nothing is magic. Every line is yours.

## Running Vault

### Run the dev server (every time)

This is the flow you use every day to open Vault in your browser.

**1. Open PowerShell.**
Press the **Windows key**, type **PowerShell**, press **Enter**. A blue
window opens with a prompt that looks like `PS C:\Users\LuisC>`.

**2. Move into the Vault project folder.**
Type this command exactly and press Enter:

```powershell
cd C:\Users\LuisC\code\vault-app
```

Your prompt should now read `PS C:\Users\LuisC\code\vault-app>`. **This
step is the one most commonly skipped.** If you run `npm run dev` from
the default PowerShell folder (`C:\WINDOWS\System32`) or anywhere else,
you will get this error:

```
npm error code ENOENT
npm error path C:\WINDOWS\System32\package.json
```

That error always means "you're in the wrong folder." Re-run the `cd`
command above and try again.

**3. Start the dev server.**

```powershell
npm run dev
```

After a few seconds you'll see output ending with something like:

```
▲ Next.js 15.x.x
- Local:   http://localhost:3000
✓ Ready in 2.3s
```

**4. Open Vault in your browser.**
Go to **<http://localhost:3000>**. Available pages so far:

| Page          | URL                                       |
| ------------- | ----------------------------------------- |
| Home          | <http://localhost:3000>                   |
| Upload        | <http://localhost:3000/upload>            |
| Files         | <http://localhost:3000/files>             |
| Transactions  | <http://localhost:3000/transactions>      |
| Cashflow      | <http://localhost:3000/cashflow>          |
| Net Worth     | <http://localhost:3000/net-worth>         |
| Accounts      | <http://localhost:3000/accounts>          |
| Credit Cards  | <http://localhost:3000/credit-cards>      |
| Categories    | <http://localhost:3000/categories>        |
| Payroll       | <http://localhost:3000/payroll>           |
| Transfers     | <http://localhost:3000/transfers>         |
| Review Queue  | <http://localhost:3000/review>            |
| Settings      | <http://localhost:3000/settings>          |

**5. To stop the server**, click back into the PowerShell window and
press **Ctrl + C**. Just closing the browser tab does *not* stop the
server — it'll keep running in the background until you Ctrl+C the
PowerShell window (or close it).

### First-time setup (only once per computer)

Skip this section if you've already set Vault up on this machine. You
only need to do this the very first time on a new laptop.

**1. Install Node.js.** Download the **LTS** installer from
<https://nodejs.org/> and run it. This gives you `node` and `npm` (the
package manager Vault uses). Confirm it worked by opening PowerShell
and running `node --version` — you should see something like `v22.x.x`.

**2. Clone the repo** to `C:\Users\LuisC\code\vault-app`. If you're
reading this README from inside that folder, you've already done this.

**3. Install the project's dependencies.** In PowerShell, after you've
`cd`'d into the project folder (step 2 of "Run the dev server"):

```powershell
npm install
```

This takes 1–3 minutes the first time. It downloads everything Vault
depends on into a `node_modules/` folder. Re-run this whenever you pull
new code and the dependency list has changed.

**4. Configure your database connection.** Vault talks to a Postgres
database hosted on Neon. The connection string lives in a file called
`.env` at the project root.

If `.env` doesn't exist yet:

```powershell
copy .env.example .env
```

Then open `.env` in any text editor and paste your Neon `DATABASE_URL`
into the line that starts with `DATABASE_URL=`.

**5. Initialize the database tables** (only needed on a fresh database):

```powershell
npm run db:push    # creates tables from lib/db/schema.ts
npm run db:seed    # seeds the categories hierarchy
```

If you're connecting to the existing shared Neon database, the tables
are already there and you can skip this step.

**6. Load your data — upload statements in-app.**
Open **<http://localhost:3000/upload>** and drag in statement / paystub PDFs.
They're parsed and written straight to Neon (the original PDF is stored too), and
appear on **/files**. This replaced the old `master.xlsx` import path; that file
is now export-only (Settings → Export to Excel). The legacy
`npm run db:load-master path\to\master.xlsx` still exists for historical loads.

> **Parser dependencies:** the parser shells out to Python (`PYTHON_BIN`
> overridable) and `pdftotext`. **Paystub** parsing needs a **poppler**
> `pdftotext` for `-tsv` (the Git-bundled binary is Xpdf and lacks it) — install
> poppler and put it on PATH, or set `PDFTOTEXT_BIN`. Other statements work with
> any `pdftotext`. After changing `parser/*.py`, restart the dev server.

**Resetting for a dry run:** `npm run db:reset` clears ingested data (keeps
accounts); `npm run db:reset:all` is a full clean slate. Both always keep the
taxonomies (categories, account types, vendor rules, settings).
`scripts/reprocess-paystubs.ts` re-parses stored paystub PDFs in place after a
parser fix (no re-upload).

### Troubleshooting

| What you see                                                                 | What it means                                                          | Fix                                                                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ENOENT: no such file or directory, open 'C:\WINDOWS\System32\package.json'` | You ran `npm run dev` from the wrong folder.                           | `cd C:\Users\LuisC\code\vault-app` first, then `npm run dev`.                                      |
| `Error: connect ECONNREFUSED` / database errors                              | `.env` missing or `DATABASE_URL` is wrong.                             | Check `.env` exists in the project root and the Neon connection string is set.                     |
| `Error: Cannot find module '...'`                                            | Dependencies missing or out of date.                                   | Run `npm install`.                                                                                 |
| `Port 3000 is already in use`                                                | Another dev server is still running (or another app grabbed the port). | Find the other PowerShell window and press Ctrl+C, *or* start Vault on a different port: `npm run dev -- -p 3001`. |

## Project structure

```
app/
  api/                    HTTP API — what any frontend would consume
    review/queue/         GET — next transaction + similar context
    transactions/[id]/    PATCH (generic), POST categorize
    categories/           GET — flat list with parent info
  review/                 Review Queue page (server shell + client component)
  layout.tsx, globals.css Root + design tokens
  page.tsx                Home (placeholder)

components/
  Sidebar.tsx             Shared nav

lib/
  db/
    schema.ts             Drizzle schema — single source of truth
    client.ts             DB client (Neon serverless driver)
    migrations/           Generated by drizzle-kit
  api/
    respond.ts            Server response helpers
    client.ts             Tiny client-side fetch wrapper
  transactions/
    merchant.ts           merchantPrefix + cleanMerchant utilities

scripts/
  seed-categories.ts      Populates categories hierarchy
  load-master.ts          Loads master.xlsx idempotently

drizzle.config.ts         drizzle-kit config
```

## API surface

All routes return `{ data: T } | { error: { code, message } }`. Frontend uses
a discriminated union — no try/catch needed for typical flows.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/review/queue?skip=ID,ID&limit=25` | Next uncategorized txn + similar + suggestion |
| POST | `/api/transactions/[id]/categorize` | Apply category, optionally to all uncategorized similar |
| PATCH | `/api/transactions/[id]` | Generic update (merchant, isTransfer, tags, notes); when `applyMerchantToSimilar=true` and `merchant` changed, also renames matching uncategorized txns |
| GET | `/api/categories` | Flat list with parent info |

This is the public contract. Build an iOS app, a CLI, a Slack bot — same
endpoints work.

## Design decisions baked in

**Sign convention.** `amount` is signed from the account holder's perspective.
Outflows negative, inflows positive, on every account type. `SUM(amount)` over
an account = net flow.

**Transfers excluded by default.** All aggregation views filter
`is_transfer = false`. Mark a transaction as a transfer to keep it in the
ledger but exclude it from spending/income totals.

**Idempotent imports.** `content_hash = sha256(account_id|date|amount|raw)`.
Re-running the loader on the same file is a no-op.

**`needs_review` is product, not edge case.** Your parser produces uncategorized
rows on purpose; the Review Queue is a first-class page for clearing them.

**Merchant rename: Option B.** Inline edit, then a confirm dialog asks "apply
to all matching uncategorized?". Only touches `needs_review = true` rows —
never overwrites your existing categorizations. A real Merchant Rules CRUD
page is on the v2 list.

**Categorization suggestions are SQL, not ML.** "Most common category among
the last N matching merchant transactions." Gets better as you categorize more.

## What's next

Ranked, do them in roughly this order:

1. **Run it locally** with your real data and use it for a real monthly cleanup
2. **Dashboard page** — real data behind your existing mockup
3. **Transactions list page** with filtering — the everyday "where did the
   money go" tool
4. **Cashflow page** — the bar+line+sankey screen, served from a `/api/cashflow`
   endpoint that aggregates by month
5. **Net Worth page** — point-in-time balance snapshots, manual entry form for
   investment accounts
6. **Auth** when you want to access from your phone over the public internet
   (Lucia is the lightweight choice; Auth.js is the heavyweight)
7. **Merchant Rules page** — the audit/manage view for renames done in v1

## Why API routes, not Server Actions or DB-from-RSC

Server Actions and direct DB calls in React Server Components are the Next.js
recommended path for tightly-coupled monoliths. They're great. But:

- They couple your frontend and backend at the *function* level, not the
  *HTTP* level. Hard to swap one out later.
- They hide the network boundary, which means it's harder to reason about what
  happens on which side.
- They're Next.js-specific. API routes are just HTTP — any client can hit them.

For a project where you want to keep the option of building a native iOS app
or a CLI later, explicit HTTP boundaries are worth the small extra ceremony.
