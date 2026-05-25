# Mortgage payment split — scoping plan

> Status: **first pass shipped 2026-05-25.** Built with a `transaction_splits`
> side-table (not child rows) so account balances are never touched — see the
> model note below. Remaining: expand split parts into spend reports (today split
> parents are excluded, so interest isn't yet counted as spending) + escrow
> sub-ledger/disbursements + auto-detection.
> Goal: take the single monthly mortgage outflow from checking and split it into
> **principal**, **interest**, and **escrow**, each landing in the right place.

## The goal, concretely

A checking statement shows one line: `−$2,500.00  MORTGAGE PMT`. Economically
that one payment is three different things:

| Part | Economic meaning | Where it should land |
|---|---|---|
| **Principal** | Pays down the loan | **Transfer** checking → mortgage account (reduces the liability balance). Not spending. |
| **Interest** | Cost of borrowing | **Outflow / expense** (category: *Mortgage Interest*). Real spending. |
| **Escrow** | Pre-funds taxes + insurance | **Transfer** checking → an **escrow** sub-account (asset). Later disbursed to property tax / insurance. Not spending (yet). |

So this is not just "categorize one row three ways" — principal and escrow are
**transfers to other accounts**, and only interest is true spending. That's what
makes it heavier than a normal split.

## What exists today (and what doesn't)

- **No split model.** `transactions` is flat — one row, one `amount`, one
  `categoryId`. There is no parent/child or `transaction_splits` table.
- **Transfers** are modeled with `isTransfer` + `transferPairId` (links the two
  legs). Category `flow_type='transfer'` excludes a row from spend/income.
- **Amortization already solves the hard part.** `lib/properties/amortization.ts`
  returns, for every payment index/date, the exact `principal` and `interest`.
  So for a given payment we already *know* the correct principal/interest split —
  we don't have to guess. Escrow = `actualPayment − scheduledP&I`.
- A property links to its mortgage account (`properties.mortgageAccountId`); the
  mortgage account holds the loan terms.

## Recommended model — child-row splits + transfer legs

Two ways to represent a split: child rows vs. a separate `transaction_splits`
table. **Recommend child rows**, because all current reporting (Cashflow,
Transactions, Net Worth) already sums `transactions` by `category_id` /
`flow_type` — child rows that are normal transactions "just work" if we exclude
the split parent from aggregation. A side table would force every aggregate
query in the app to learn about splits.

### Schema changes
- `transactions.splitParentId uuid → transactions.id` (null = not a split child).
- `transactions.isSplitParent boolean default false` (the original $2,500 row;
  kept for provenance, **excluded** from category/flow aggregations because its
  children carry the real categorization).
- New account: an **escrow account** per property (type `escrow`, asset). Add
  `properties.escrowAccountId uuid → accounts.id` (nullable; created on demand).
- Reuse `isTransfer` + `transferPairId` for the principal and escrow legs.

### What a split creates (for one $2,500 payment, say $400 principal / $1,900 interest / $200 escrow)
1. Mark the checking row `isSplitParent = true` (stays at −$2,500 for provenance).
2. Children on **checking** (sum to −$2,500), each `splitParentId = parent`:
   - −$400 · *Principal* · `isTransfer` → paired with a **+$400 on the mortgage account** (reduces loan).
   - −$1,900 · *Mortgage Interest* (outflow). True spend.
   - −$200 · *Escrow* · `isTransfer` → paired with a **+$200 on the escrow account**.
3. The mortgage `+$400` and escrow `+$200` are the transfer partners
   (`transferPairId`), so balances move correctly and nothing double-counts.

### Deriving the numbers
- Look up the payment in the amortization schedule by **date** (nearest scheduled
  payment) → gives `principal` + `interest` exactly.
- `escrow = |actualPayment| − (principal + interest)`. If the actual equals P&I
  (no escrow), escrow = 0. If escrow is configured on the property, prefer that
  and let interest/principal come from the schedule.
- Show the proposed split pre-filled and **editable** before the user confirms
  (taxes/insurance change escrow; extra-principal payments happen).

## Reporting impact (the careful part)
- **Exclude split parents** everywhere we sum spend/income: add
  `AND is_split_parent = false` to the Cashflow / category / Net Worth queries.
  Children + non-split rows are the truth.
- Net Worth already nets transfers within own accounts; principal transfer to the
  mortgage and escrow transfer to the escrow account are balance-neutral to net
  worth (asset/liability move), interest is the only true outflow — which is
  exactly right.
- Transfers reconciliation page already pairs legs via `transferPairId`.

## Trigger / UX
- **Phase 1 (manual):** on a transaction that looks like a mortgage payment
  (or any txn), a **"Split payment"** action opens a modal pre-filled from the
  linked property's amortization schedule (principal/interest) + escrow
  remainder; user tweaks and confirms. Also reachable from the property detail
  page ("Record this month's payment → split").
- **Phase 2:** an **escrow sub-ledger** on the property — escrow balance, and
  disbursements (property tax, insurance) drawn from it.
- **Phase 3 (auto):** detect the recurring mortgage outflow (amount + merchant
  cadence) and offer to auto-split on import, since the schedule makes the split
  deterministic.

## Edge cases to handle
- Extra principal (payment > scheduled) → surplus goes to principal.
- Escrow shortage/overage adjustments (annual re-analysis).
- Payment that doesn't match a scheduled date (skipped/double) → let user pick the
  schedule row or enter manually.
- Un-split / re-split (delete children + transfer legs, clear parent flag).
- Property with **no** linked mortgage or no loan terms → split is manual-only
  (no schedule to pre-fill).

## Suggested phasing
1. **Split engine + schema** (`splitParentId`, `isSplitParent`, escrow account,
   transfer legs) + exclude-parent in aggregations + the manual Split modal
   pre-filled from amortization. ← the core ask.
2. Escrow sub-ledger + disbursements on the property.
3. Auto-detection of the recurring mortgage payment.

## Open questions for sign-off
1. **Child rows vs. splits table** — recommend child rows (above). OK?
2. **Escrow as a real account** (so its balance + disbursements are first-class)
   vs. just an escrow *category*? Recommend a real `escrow` account per property.
3. **Generic vs. mortgage-only splits** — build the split engine generic (any
   transaction, any number of parts) and let the mortgage flow be the first
   consumer? Recommend generic; it's barely more work and unlocks normal splits.
4. Trigger for Phase 1: manual action on the transaction, the property page, or
   both?
