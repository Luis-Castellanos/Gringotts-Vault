# Bank Statement Format Reference

Layout patterns for the major issuers the user works with. All examples assume `pdftotext -layout` output.

## General principles

- Use `pdftotext -layout` (NOT plain `pdftotext`). Layout mode preserves column alignment so dates, descriptions, and amounts stay on the same logical line.
- Scan for the **statement period** in the first 1–2 pages. Common labels: `Statement Period`, `Statement Date`, `Opening Date / Closing Date`, `Billing Cycle`.
- Find **section headers** that bracket the transaction list. Common ones: `DEPOSITS AND OTHER ADDITIONS`, `WITHDRAWALS`, `CHECKS PAID`, `ATM & DEBIT CARD WITHDRAWALS`, `PURCHASES`, `PAYMENTS AND OTHER CREDITS`.
- Inside each section, transactions are typically one per line with the format: `<date> <description> <amount> [<balance>]`.
- Stop parsing a section when you hit a `Total` line or the next section header.

## Statement summary — audit control totals (parser goal)

> **Goal for every format.** The parser must not only reconstruct the
> transaction rows — it must also capture the statement's own **stated control
> totals** so each statement can be reconciled *independently of the rows we
> parsed*. This is what powers the statement-audit page (stated-vs-derived).

`extract_statement_summary()` returns, per statement (null where the format
doesn't print a value or extraction isn't implemented yet):

| Field | Meaning |
|---|---|
| `period_start` / `period_end` | Statement bounds as real dates (derived from the period string). |
| `beginning_balance` | Stated opening balance (from the summary block, **not** derived). |
| `ending_balance` | Stated closing balance. |
| `stated_credits` | Stated total deposits / payments-in. |
| `stated_debits` | Stated total withdrawals / charges (abs). |

The audit then checks three things independently:
1. **Statement math:** `beginning + stated_credits − stated_debits == ending`.
2. **Capture completeness:** our parsed `sum(inflows) == stated_credits` and `sum(outflows) == stated_debits` (did we drop or duplicate a row?).
3. **Row chain** (bank statements with a running balance): `balance[i] == balance[i-1] + amount[i]` — a break points at the exact bad row.

**Per-format coverage:**

| Format | Running balance | begin/end | stated totals | Status |
|---|---|---|---|---|
| Chase Checking | ✅ per row | ✅ Beginning/Ending Balance lines | ✅ CHECKING SUMMARY | **done** |
| Gain FCU | ✅ per row | ✅ (best-effort; multi-account) | ⚠️ partial | partial |
| Chase Card | ❌ | reconcile via ACCOUNT SUMMARY (prev/new balance) | payments/purchases | **TODO** (emit null) |
| Discover | ❌ | ditto | ditto | **TODO** (emit null) |
| Apple Card | ❌ | prior/total balance block | payments/charges | **TODO** (emit null) |

Credit cards print no per-row running balance, so their audit is a different
model (prev balance + purchases − payments + interest + fees == new balance).
Documented as the goal; implement when sample statements are available — until
then they emit nulls and the audit page shows coverage + flows + count without a
balance check.

## Chase

### Chase Checking (Total Checking, College Checking, etc.)

**Statement period**: `January 10, 2024 through February 08, 2024` (written month, full year, "through" separator). At top of page 1.
Regex: `(\w+)\s+(\d{1,2}),\s*(\d{4})\s+through\s+(\w+)\s+(\d{1,2}),\s*(\d{4})`

**Transaction section**: starts after the line `TRANSACTION DETAIL`. All transactions are in a single section (Chase intermixes deposits and withdrawals chronologically rather than separating them).

**Line format**:
```
MM/DD   description...                     AMOUNT       BALANCE
```
Two amounts on each line: the signed transaction amount, then the running balance. Both can be negative.

**Sign convention**: Chase Checking pre-signs amounts correctly for our schema — deposits printed positive, withdrawals printed negative. **Use as-is, don't flip.**

**Year inference**: dates are MM/DD only (no year on the row). Use the statement period — month >= start_month → start_year, else end_year. Handles year-end statements like a Dec 15 – Jan 14 period correctly.

**Running balance**: yes, printed per row. Capture it.

**Skip lines**: `Beginning Balance`, `Ending Balance`, the daily balance ledger at the top of the page, `*start*transaction detail` / `*end*` markers (these are present in the raw text), page headers `January 10, 2024 through February 08, 2024`.

**Sanity check**: `sum(all amounts) == ending_balance - beginning_balance`. For the test statement: `-281.50 == 60.69 - 342.19 ✓`.

### Chase Credit Cards (Sapphire, Freedom, Prime/Amazon, etc.)

**Statement period**: `Opening/Closing Date 02/05/21 - 03/04/21` — note the **2-digit year** is common. Always normalize to 4-digit (assume 20XX).
Regex: `Opening/Closing Date\s+(\d{2}/\d{2}/\d{2,4})\s*-\s*(\d{2}/\d{2}/\d{2,4})`

**Transaction sections**:
1. `PAYMENTS AND OTHER CREDITS` — amounts pre-printed negative (e.g. `-664.44`). Flip to **positive** for our schema (payments TO the card = credits).
2. `PURCHASE` (singular!) or `PURCHASES` — printed positive. Flip to **negative**.
3. `INTEREST CHARGED`, `FEES CHARGED` — printed positive. Treat as negative (debits).

**Line format**:
```
MM/DD   Merchant Name or Description                  AMOUNT
        Order Number    XXX-XXXX-XXXX                 [continuation - skip]
```

Some Amazon transactions have a second line with `Order Number  XXX-XXXX-XXXX` — these are continuation lines. Skip any line starting with `Order Number`.

**Year inference**: same MM/DD-only convention. Use period to assign year.

**No running balance**: leave Balance blank.

**Sanity check**: sums should match the ACCOUNT SUMMARY block at top of page 1 (`Payment, Credits` and `Purchases` lines).

## Discover

**Statement period**: `OPEN TO CLOSE DATE: 03/03/2023 - 04/02/2023` (full 4-digit years, dash separator).
Regex (anywhere on first 2 pages): `(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})`

**Section detection — IMPORTANT**: Discover's section "headers" are actually combined column-header lines:
```
TRANS.   DATE   PAYMENTS AND CREDITS                       AMOUNT
TRANS.   DATE   PURCHASES        MERCHANT CATEGORY         AMOUNT
```
Don't look for `^PAYMENTS AND CREDITS` — look for `PAYMENTS AND CREDITS` and `AMOUNT` both appearing on the same line. Same for `PURCHASES` + `MERCHANT CATEGORY` + `AMOUNT`.

**The rewards-column gotcha**: Discover prints a "Cashback Bonus Rewards" box on the right side of the page. Transactions on the same physical line have a SECOND `$` figure for cashback (e.g. `+$1.09`). **Never use "last $ on the line" logic** for Discover. Match the FIRST `$` figure that follows the transaction description with at least 2 spaces of separation:
```python
re.match(r"^\s*(\d{2}/\d{2})\s+(.+?)\s{2,}(-?\$[\d,]+\.\d{2})(?:\s|$)", line)
```

**Sign convention**: payments printed negative (`-$83.00`) → flip to positive. Purchases printed positive → flip to negative.

**Merchant Category column**: each purchase line has a category word between description and amount (`Merchandise`, `Restaurants`, `Services`, `Travel/Entertainment`, `Supermarkets`, `Gasoline`, `Department Stores`, `Medical Services`, `Government Services`, `Education`, `Home Improvement`, `Awards & Rebate Credits`). Strip these from the end of the description before storing.

**Interest charges**: not printed as transactions. They appear in the `Fees and Interest Charged` block as `TOTAL INTEREST FOR THIS PERIOD $XX.XX`. If non-zero, synthesize a row dated on the statement close date with description `INTEREST CHARGE ON PURCHASES`, signed negative.

**No running balance**: leave Balance blank.

## Gain Federal Credit Union (GainFCU)

**Statement period**: `Statement For 03/01/2022 - 03/31/2022`.
Regex: `Statement For\s+(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})`

**Transaction line format** (loan/deposit accounts):
```
MM/DD   Description...    -$AMOUNT    PRINCIPAL    INTEREST    FEES    BALANCE
```
The first $ figure is the total transaction amount (signed); the others are sub-allocations. The last $ figure is the running balance.

**Sign convention**: Gain pre-signs correctly — payments/withdrawals negative, deposits positive. Use as-is.

**Multi-account statements**: a single Gain statement can cover multiple accounts (Savings, Checking, Loan). Each account gets its own beginning/ending balance section. Transactions appear in a single combined list — don't try to split.

## Apple Card (Goldman Sachs)

### Statement period

Format: `Mon D — Mon D, YYYY` (e.g., `Feb 4 — Feb 29, 2020`). Em-dash separator, written month abbreviations, **year only at the end**. Appears in the header on every page.

Regex: `([A-Z][a-z]{2})\s+(\d{1,2})\s*[—\-–]\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})`

### Three transaction-emitting sections

1. `Payments` — payments TO the card. **Amounts pre-printed as negative** (e.g., `-$179.28`). In our schema these are credits, so flip to **positive**.
2. `Transactions` — purchases. Amounts printed positive. Flip to **negative** for our schema.
3. `Apple Card Monthly Installments` — recurring monthly charges for previously-financed purchases (Apple Card Monthly Installments / ACMI). One charge per active plan, dated at the **statement close**. See "Installments section" below.

### Multi-cardholder statements

When the card has authorized co-owners, both Payments and Transactions are split into per-name sub-sections:

```
Payments
  Payments made by Primary Cardholder         ← sub-header, NOT a section reset
    [payment rows]
  Total payments for this period              ← ends this cardholder's slice

Transactions
  Transactions by Primary Cardholder          ← sub-header
    [purchase rows]
  Total charges, credits and returns          ← ends Primary's slice; section state goes None
  Transactions by Co-Cardholder               ← MUST be matched to re-enter purchases mode
    [purchase rows]
  Total charges, credits and returns
```

The parser must recognize `Transactions by <Name>` and `Payments made by <Name>` (and `Payments by <Name>`) as section headers — otherwise subsequent cardholders' rows are silently dropped after the first `Total charges...` end marker. Section state transitions reset `last_date` only when *changing* sections, not on continuation/cardholder-sub headers.

### Installments section

After the main Payments + Transactions sections, multi-cardholder statements (and any statement with active installment plans) include an `Apple Card Monthly Installments` section. Layout:

```
Apple Card Monthly Installments
  Apple Card Installments by Primary Cardholder
    Dates    Description    Daily Cash    Amounts
    [optional date row]: MM/DD/YYYY Apple Online Store ...  N% $X.XX  $REMAINING_FINANCED
        TRANSACTION #<id>
        This month's installment: $XX.XX
        Final installment: <date>
    [repeats per active plan]
  Total financed / Total payments and credits / Daily Cash from Apple Card Installments   ← end markers
```

For each `This month's installment: $XX.XX` line, emit one transaction:
- Date = statement close date (NOT the date row above it — that's the original purchase date)
- Source = `Apple Card Monthly Installment - <merchant from preceding date row>` (merchant optional)
- Amount = negative (debit)
- Category = `Financial` / `Installment`

The date row that precedes each TRANSACTION # block is only present when the original purchase is from a prior month — first-month statements omit it. Track the most recent date row's merchant as the context for the next installment line.

### Row clustering tolerance (pdfplumber path)

Apple Card occasionally splits a single visual row across two y-coordinates 1 pixel apart — most often when the right-column `$amount` baselines on a slightly different `top` than the date+description on the left. Clustering by `round(top)` puts them in different bins and drops the row. Cluster with a tolerance of ~3 pixels instead (greedy: words within 3px of an existing cluster's anchor join it; row spacing within sections is ~10-20px so no false merges).

Known cases this affects:
- `MM/DD/YYYY Daily Cash redemption` (payments section): description at `top=N`, amount at `top=N+1`.

### Line format

Payments section (no Daily Cash column):
```
MM/DD/YYYY   ACH Deposit Internet transfer from account ending in NNNN              -$X.XX
```

Transactions section (Daily Cash column between description and amount):
```
MM/DD/YYYY   MERCHANT NAME WITH ADDRESS DETAILS                  N%    $0.XX    $X.XX
```

The merchant description includes phone numbers, ZIP codes, "CA USA" suffixes, etc. — keep it as printed; the user's keyword categorization will still match.

**Important**: a transaction line may have **multiple `$` figures**. The transaction amount is always the **last** `$` figure on the line. Earlier `$` figures are Daily Cash rewards. Cut the description at the first occurrence of `\s+\d+%\s+\$` (the rewards rate marker).

### Continuation lines (skip)

Some transactions have a second line for promo Daily Cash:
```
                Promo Daily Cash                              1%    $0.26
```
No date, no transaction amount on the right — skip these (they're rewards info, not transactions).

### What to skip

- `Total payments for this period` line
- `Total Daily Cash this month` line
- `Total charges, credits and returns` line
- The Page 1 summary block (Prior Monthly Balance, Prior Total Balance, Total Balance)
- The Page 3 sections: `Daily Cash`, `Interest Charged`, `Interest Charge Calculation`
- The Page 4 `Legal` / `Billing Rights Summary` boilerplate

### No running balance

Apple Card statements don't print a per-transaction running balance. Leave Balance blank.

### Sanity check

After parsing, verify:
- `sum(payment amounts) == abs(Total payments for this period)`
- `sum(abs(purchase amounts)) == Total charges, credits and returns`

Both should match exactly.

### Apple Card CSV export vs PDF — known discrepancies

The Wallet-app CSV export and the monthly PDF statements disagree on a few rows. None of these are parser bugs — they're Apple's own data conventions:

- **Daily Cash Adjustment date drift**: on a RETURN, Apple prints the "Daily Cash Adjustment" sub-row visually under the parent return in the PDF (no own date — the parser correctly attributes it to the parent's date). The CSV records the same adjustment dated **1-2 days later** (parent+1 typical). Same amount, same description, different date.
- **Cycle-boundary transactions**: a transaction whose Transaction Date is the statement close date often lands on the **next** cycle's PDF. The CSV shows it dated on the close, the PDF doesn't contain it. The following month's PDF does.
- **Sign convention**: CSV signs purchases POSITIVE and payments NEGATIVE (the opposite of our master schema). Returns are NEGATIVE in CSV (= credit). If ingesting the CSV directly, flip all signs.

If diffing parser output vs CSV, match by (date, amount) but expect ~5% of rows to need ±2-day fuzz on date.

## Generic / unknown bank

When the issuer isn't Chase or BofA, fall back to a more flexible regex approach:

1. **Find the statement period** by scanning for any of these patterns in the first 2 pages:
   - `Statement Period:?\s*(\d{1,2}/\d{1,2}/\d{2,4})\s*(?:to|-|through|–|—)\s*(\d{1,2}/\d{1,2}/\d{2,4})`
   - `Opening Date.*?(\d{1,2}/\d{1,2}/\d{2,4}).*?Closing Date.*?(\d{1,2}/\d{1,2}/\d{2,4})`
   - `(\w+ \d{1,2}, \d{4})\s*(?:to|-|through|–|—)\s*(\w+ \d{1,2}, \d{4})`

2. **Detect transaction lines** with a regex like:
   ```
   ^\s*(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+(.{5,80}?)\s+([-]?\$?[\d,]+\.\d{2})(?:\s+([-]?\$?[\d,]+\.\d{2}))?\s*$
   ```
   Group 1 = date, Group 2 = description, Group 3 = amount, Group 4 = optional balance.

3. **Determine sign** by section context. Track the most recent section header seen. If the header contains words like "withdrawal", "debit", "purchase", "payment" (in non-credit-card context), "fee", "charge" → negative. If it contains "deposit", "credit", "addition", "payment" (in credit-card context, since payments TO the card are credits to the balance) → positive.

4. **Sanity check**: after parsing, the sum of all amounts should approximate (Ending Balance - Beginning Balance) for checking accounts. If it's wildly off, something is mis-signed — flag for review rather than silently shipping.

## Date-year inference

Statement spans Dec 15 — Jan 14 (year-end). Transactions printed as MM/DD only:
- "12/20" → year of statement start (e.g., 2024)
- "01/05" → year of statement end (e.g., 2025)

Implementation: if `month >= start_month` use start year, else use end year. This handles both year-end and same-year statements correctly.

## What to skip (common false-positive transaction lines)

- "Beginning balance", "Ending balance", "Previous balance", "New balance"
- Section subtotals: "Total deposits", "Total withdrawals"
- Page headers/footers: "Page X of Y", "Account number XXXXXX"
- "Continued on next page" / "Continued from previous page"
- Daily balance ledger (a list of dates → end-of-day balance, not transactions)
- Reward summaries, points earned summaries
- Disclosure / fine print sections at the end

A reliable filter: a real transaction line has a date AND an amount. If only one is present, it's probably not a transaction.

## Loan statements — Chase Mortgage & Auto (added 2026-05-25)

**Detection:** `chase_mortgage` (`MORTGAGE STATEMENT` in head + Chase/escrow/unpaid-principal markers) and `chase_auto` (`CHASE AUTO` + vehicle/VIN/loan markers). Both checked **before** the Chase deposit/card branches (which would claim them on "Chase" alone). This fixed the auto-loan welcome letter misdetecting as `chase_card`.

**Current behavior:** recognized + **deferred** (type `loan`, stored, clean account label from filename), NOT auto-ledgered. The summary captures statement date → `period_end` and unpaid principal → `ending_balance`.

**Mortgage format** (Chase): page 1 has Account number, Original/Unpaid principal balance, Interest rate, Maturity, Escrow balance, and the Past-payments + Explanation-of-amount-due breakdowns (Principal/Interest/Escrow). Page 2 "Transaction activity" table: `MM/DD/YYYY  PAYMENT  $total  $principal  $interest  $escrow`. **Auto** sample is only a welcome letter (no payment activity yet).

**⚠ Xpdf-layout caveat:** `extract.py` uses the PATH `pdftotext` (Xpdf), which **badly mangles the mortgage's two-column page** — values land on different lines than their labels (e.g. unpaid principal $ separates from its label). Regex field extraction from Xpdf `-layout` is unreliable here; robust extraction needs poppler `-tsv` (coordinate), same as Fidelity/Empower holdings.

**⚠ OPEN DECISION — loan-ledger model (why deferred, not ledgered):** naive payment rows on the loan account corrupt balances + double-count:
- The loan balance is derived (`-SUM(amount)` / amortization). Emitting only principal payments (no opening-balance row) makes Net Worth show the mortgage as a tiny *asset* (~sum of principal paid), not the ~$191k *debt*.
- The checking-side mortgage-split feature already moves principal→loan / interest→expense / escrow→escrow when the checking payment is split, so ledgering the mortgage statement too would **double-count** the principal paydown.
- Clean options to ledger later: (a) **`balance_snapshots`** — store the unpaid principal per statement date + wire balance derivation to prefer the latest snapshot (the table exists for exactly this "incomplete transactions" case); (b) synthetic opening-balance transaction; (c) keep loans statement-recognized only and rely on the checking-side split. Decide with the user before ledgering.
