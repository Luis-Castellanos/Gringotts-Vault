# Investment / brokerage statement formats (holdings parser)

Scoping notes for the brokerage-statement parser that populates the `holdings`
table (→ Investments page holdings view). Started 2026-05-25.

## Statement inventory (OneDrive: `01 - Finances/02 - Assets`)

Real source PDFs live in account folders, not the bank `Statement Extraction/`
pipeline. Counts as of 2026-05-25:

| Account | Issuer / format | # stmts | Holds real positions? |
|---|---|---|---|
| Chase Investments #5688 | **JPM** Self-Directed (J.P. Morgan Securities) | 58 (2020–24) | No — runs ~$0–$58, positions show as zeros |
| Fidelity Roth IRA #6856 | **Fidelity** (NFS) | 29 | **Yes** — clean Holdings table |
| Empower 401k | **Empower** | 8 | Yes (TBD) |
| Optum HSA #5229 / #6476 | **Optum** | 11 + 6 | Yes (TBD) |
| Schwab Brokerage #1022, Coinbase, M1, Robinhood, WeBull, Vanguard | — | 0 | No statements downloaded yet |

**Implication:** the issuer already detected + deferred (`jpm_investment`) is the
*least* useful (near-empty account). The high-value targets are **Fidelity**
(clean format, 29 stmts), then Empower 401k and Optum HSA. Schwab/Vanguard/etc.
have no statements in OneDrive yet.

## Parsing approach

`pdftotext -layout` (the bundled Xpdf build) gives readable text but **misaligns
multi-line columnar cells** — holdings tables are columnar, so coordinate-based
`pdftotext -tsv` (poppler) is the robust tool, same as the paystub parser. The
bundled binary lacks `-tsv`; `parser/extract.py` already resolves a poppler
binary when available and falls back to `-layout`. Holdings extraction should
prefer `-tsv` where present.

**Tooling confirmed (2026-05-25):** poppler IS installed on this machine via
WinGet (`…/oschwartz10612.Poppler…/poppler-25.07.0/Library/bin/pdftotext.exe`) —
`-tsv` works, so coordinate parsing + local validation against real statements is
feasible.

**⚠ Fidelity holdings pages are ROTATED 90°.** In the `-tsv` output, words on the
same *visual* line share the **`left`** coordinate and differ in `top` (e.g.
"INVESTMENT"/"REPORT" both at left≈49.69). The paystub parser clusters by `top`
(normal orientation); the Fidelity holdings parser must detect rotation and
cluster by `left` instead (columns then run along `top`). This is the main
implementation wrinkle.

Target output per position (→ `holdings` table): `symbol`, `name`, `assetClass`
(equity/etf/mutual_fund/bond/cash/crypto/option/other), `quantity`, `costBasis`,
`statementPrice`, `statementValue`, `asOf` (statement period end).

## Fidelity (NFS) — RECOMMENDED FIRST TARGET

`-layout` Holdings section (clean, column-rich):

```
Holdings
Mutual Funds        Beginning      Quantity       Price        Ending        Cost    Unrealized    EAI ($) /
                    Market Value   Sep 30, 2021   Per Unit     Market Value          Gain/Loss     EY (%)
<one row per fund>
Total Mutual Funds (100% of account)              $27.89               $2.89  $0.36
Total Holdings                                    $27.89    $25.00     $2.89  $0.36
```

- Sub-tables per asset class: **Mutual Funds**, **Stocks**, **ETFs**, **Bonds**,
  **Core Account** (cash), etc. Header → `assetClass`.
- Columns map directly: Ending Market Value → `statementValue`, Price Per Unit →
  `statementPrice`, Quantity → `quantity`, Cost → `costBasis`.
- `as_of` = statement period end (e.g. "Sep 30, 2021"); also in the Quantity
  column header.
- Account # appears as `Account # 237-483927`.

## JPM (Chase Investments / J.P. Morgan Self-Directed)

Detected by `detect_issuer` as `jpm_investment` (markers: INVESTMENT STATEMENT /
BROKERAGE / J.P. MORGAN SECURITIES / ACCOUNT VALUE). Sections:

- **Statement Period** ("August 01 - August 30, 2024") + **Account Number**
  (975-65688).
- **Asset Allocation Summary** → TOTAL ACCOUNT VALUE.
- **Holdings**: asset-class blocks (`CASH & SWEEP FUNDS`, `EQUITIES`, …) →
  per position: name line (a `P ` prefix = pending-settlement), `Quantity` /
  `Price` / `Market Value` columns, then a `Symbol: NVDA` line; `TOTAL EQUITIES`.
- **TRADE AND INVESTMENT ACTIVITY**: BUY/SELL rows w/ quantity, price, cost
  basis, realized gain/loss (richer than holdings on this near-empty account).
- Cash sweep position is `CHASE DEPOSIT SWEEP … Symbol: QACDS`.

Multi-line position entries (name, "COMMON STOCK", "Dividend Reinvested",
"Symbol: X" across lines) make `-layout` parsing fiddly — `-tsv` strongly
preferred here.

## Empower 401k

Real statements live in year subfolders (`2025/`, `2026/`); the top-level files
are a loan note + plan confirmation, not holdings. The holdings section is
**"How is my account invested?"**:

```
                   Balance   /Change   Transfers/Expenses   Balance    Units/Shares
Large Cap Funds    1,281.66  2,760.09  -149.98      -6.75   3,885.02   14.871
Fidelity 500 Index           2,760.09  -149.98
```

- Grouped by category (`Large Cap Funds`, …) → `assetClass`; fund name below.
- Ending `Balance` = `statementValue`; `Units/Shares` = `quantity`;
  `price` = value/units (derived). **No ticker symbol, no cost basis** in this
  format. Account is a real holder (~$3.9k, Fidelity 500 Index).

## Optum HSA — CASH, not holdings

Optum HSA statements show `HSA Mutual Funds $0.00` — the balance sits in cash
(`Total Balance $366.66`), with a Date/Description/Deposits/Withdrawals/Balance
table. So Optum is effectively a **cash/transaction account**, not a holdings
account — parse it as bank-style transactions (or skip) rather than holdings.

## Plumbing to build (issuer-agnostic, once)

1. `ExtractResult.holdings?: ParsedHolding[]` in `lib/parser/extract.ts` +
   emit from `parser/extract.py`.
2. `ingestHoldings(accountId, holdings, importId)` in `lib/ingest` → upsert the
   `holdings` table (replace the account's positions for that `as_of`).
3. Upload route: when a parsed statement carries holdings, ingest them instead
   of deferring. The Investments holdings view (already built) lights up.
