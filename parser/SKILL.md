---
name: bank-statement-extractor
description: "Use this skill whenever the user uploads one or more bank or credit card statement PDFs and wants the transactions pulled into a spreadsheet. Triggers on phrases like 'extract transactions', 'parse this statement', 'pull the transactions from this PDF', 'add these to my master file', 'reconcile this statement', or any time a .pdf bank/credit-card statement is the input and a tabular output is the goal. Also trigger when the user uploads multiple statements at once and wants them combined. Output is always an .xlsx file with columns: Date, Account, Account #, Source, Category, Sub-category, Amount, Balance, Stmt period, Source file. The parser does NOT categorize — Category and Sub-category columns are left blank for downstream tools to fill. Append-to-master is the default behavior — if a master file exists or is uploaded alongside new statements, append new transactions to it; otherwise create a fresh master file. Do NOT use for non-statement PDFs (general financial documents, tax returns, invoices) or when the user wants a non-spreadsheet output."
---

# Bank Statement Transaction Extractor

## What this skill does

Reads bank or credit card statement PDFs, extracts every transaction, and writes the results to an Excel workbook with a fixed schema. **Pure extraction — categorization is intentionally out of scope.** The Category and Sub-category columns are left blank; downstream tools (the user's own categorization pipeline) populate them. Default mode is **append to master file** — every run adds new transactions to a single growing master sheet so the user builds up a consolidated transaction history over time.

## Output schema (fixed — do not deviate)

| Column | Description |
|---|---|
| Date | Transaction date as a real Excel date (MM/DD/YYYY display) |
| Account | Human-readable account label like `Chase Checking 1234` or `Apple Card 5678` — derived from the filename (or PDF text fallback). See "Deriving the Account label" below. |
| Account # | The last-4 digits of the account, as text (e.g. `1234`). Stored as text so leading zeros and "0042"-style prefixes are preserved. Blank if the last-4 can't be determined. |
| Source | The transaction description exactly as printed on the statement |
| Category | **Always blank** — parser does not categorize. Downstream tools fill this. |
| Sub-category | **Always blank** — parser does not categorize. Downstream tools fill this. |
| Amount | Signed number — debits/withdrawals negative, credits/deposits positive |
| Balance | Running balance after this transaction (may be blank if statement doesn't print one per row) |
| Stmt period | Statement period as text, format: `MM/DD/YYYY - MM/DD/YYYY` |
| Source file | Original PDF filename — kept for audit trail / re-tracing rows back to the source |

### Deriving the Account label and number

The user's PDFs typically arrive with filenames like:
```
Chase_Checking__1234__0110_2024_thru_0208_2024_.pdf
0000000000000_Chase_Prime__5678__0205_2021_thru_0304_2021_.pdf
Apple_Card__9999__0201_2020_thru_0229_2020_.pdf
```

The pattern is `[optional_long_digit_prefix_]Bank_AccountType__LAST4__date_range_.pdf`. The skill's `derive_account_info()` function returns `(account_label, account_number)`:
1. Strips any leading 8+ digit prefix (the upload-system ID)
2. Matches `<bank_type>__<last4>__` and produces `("Bank Type LAST4", "LAST4")`
3. Falls back to issuer + last-4 from the PDF text if filename doesn't match
4. Falls back to issuer label only with empty account number as last resort

Use the helper from `scripts/parse_statements.py` rather than re-implementing.

**Note on account # storage**: write the Account # cell with `cell.number_format = "@"` to force text formatting. Otherwise Excel will treat e.g. `0042` as a number and strip the leading zero.

## Workflow

### Step 1 — Locate inputs

Check `/mnt/user-data/uploads/` for:
- One or more `.pdf` files (the statements to parse)
- Optionally an `.xlsx` file (the existing master to append to)

```bash
ls -la /mnt/user-data/uploads/
```

If the user uploaded an existing master `.xlsx`, copy it to `/home/claude/master.xlsx` and append to it. If not, create a new master at `/home/claude/master.xlsx`.

### Step 2 — Inspect each PDF

For each statement PDF, run a quick diagnostic to determine whether it's a text PDF (extractable) or a scanned image (needs OCR / vision):

```bash
pdfinfo /mnt/user-data/uploads/statement.pdf
pdftotext -layout -f 1 -l 2 /mnt/user-data/uploads/statement.pdf - | head -60
```

If `pdftotext` returns real text → use the text-extraction path (Step 3a).
If it returns empty/garbled → use the visual path (Step 3b).

### Step 3a — Text extraction path (most modern statements)

Use `pdftotext -layout` to preserve column alignment, then parse with Python. The layout flag is critical — it keeps date / description / amount / balance in fixed columns instead of collapsing them into a wrapped paragraph.

```bash
pdftotext -layout /mnt/user-data/uploads/statement.pdf /home/claude/statement.txt
```

#### Detect issuer first, then dispatch

Before parsing, identify which issuer the statement is from (by scanning the first ~5000 chars for distinctive phrases). The parsing logic is too different across issuers to share one parser:

| Issuer | Detection signal | Notes |
|---|---|---|
| Apple Card | `APPLE CARD` + `GOLDMAN` | Em-dash period, multi-$ Daily Cash column |
| Discover | `DISCOVER IT` or `DISCOVER CARD` | Multi-$ rewards box on each line |
| Gain FCU | `GAIN FEDERAL CREDIT UNION` | Multi-account, loan-payment breakouts |
| JPM Investment | `INVESTMENT STATEMENT`, `BROKERAGE`, `J.P. MORGAN SECURITIES` | **OUT OF SCOPE — see below** |
| Chase Checking | `JPMORGAN CHASE` + `TRANSACTION DETAIL` | Pre-signed amounts, has running balance |
| Chase Card | `CHASE` + `PAYMENTS AND OTHER CREDITS` | 2-digit year in period |

**IMPORTANT ordering**: check `INVESTMENT STATEMENT`/`BROKERAGE` BEFORE Chase, because JPM investment statements have Chase branding but are not bank/credit card statements.

See `references/bank_formats.md` for the layout patterns of each issuer. Key things to identify per format:

1. **Statement period** — usually printed near the top, formats vary ("Statement Period: 03/15/2024 to 04/14/2024", "March 15, 2024 — April 14, 2024", "Opening/Closing Date"). Extract as two dates and format as `MM/DD/YYYY - MM/DD/YYYY`.
2. **Statement year** — transaction dates are often printed without a year (e.g., "03/15"). Use the statement period to assign the correct year, **carefully handling year-end statements** where January transactions on a December–January statement belong to the new year.
3. **Transaction sections** — most statements split into "Deposits/Credits" and "Withdrawals/Debits" (or "Payments" and "Purchases" for credit cards). Sign the Amount column accordingly: deposits/payments-to-card positive, withdrawals/purchases negative.
4. **Running balance** — checking accounts usually print one per row; credit cards usually don't. Leave blank if not present.
5. **Skip non-transaction lines** — "Beginning balance", "Ending balance", subtotals, page headers/footers, "continued on next page".

### Step 3b — Visual path (scanned statements)

If text extraction fails, rasterize each page and read it with vision:

```bash
pdftoppm -jpeg -r 200 /mnt/user-data/uploads/statement.pdf /home/claude/page
ls /home/claude/page-*.jpg
```

Then `view` each page image and transcribe the transactions manually into the same data structure. For statements over ~10 pages, ask the user before proceeding — vision parsing is slow and token-heavy.

### Step 4 — Write/append to master

Use `openpyxl`. The master file has one sheet named `Transactions` with the schema above starting at row 1 (header row).

**If creating new:**
- Create the workbook
- Write headers in row 1 with bold + light-gray fill
- Freeze the top row
- Set column widths: Date 12, Account 22, Account # 10, Source 45, Category 18, Sub-category 22, Amount 12, Balance 14, Stmt period 22, Source file 50
- Format Date column as `mm/dd/yyyy`
- Format Amount and Balance as `#,##0.00;(#,##0.00);-` (negatives in parens, zero as dash)
- Apply an Excel Table (`Ref` over the data range) so the user can sort/filter natively

**If appending:**
- Open the existing workbook
- Find the next empty row on `Transactions`
- Before writing, check for duplicates: a duplicate is a row with the same Date + **Account** + Source + Amount already present. Account is part of the key so the same charge appearing on two different cards is NOT treated as a duplicate. Skip duplicates and report the count to the user.
- Extend the Excel Table range to include the new rows
- Sort the entire sheet by Date ascending after the append

See `scripts/build_master.py` for the reference implementation — read it before writing your own version.

### Step 5 — Save and present

Copy the final file to `/mnt/user-data/outputs/transactions_master.xlsx` and use `present_files`.

In the chat reply, give a short summary:
- N statements processed (list filenames)
- N transactions extracted
- N duplicates skipped (if appending)
- Date range covered
- Any obvious parser issues (suspicious amounts, missing data) flagged for review

Keep the summary tight — the user is a forensic accountant and will inspect the file directly. Category/Sub-category columns are intentionally left blank and the user fills them in their own categorization tool downstream.

## Edge cases to handle

- **Multi-statement uploads**: process each PDF independently, then write all together in one append operation. Don't write-then-append-then-append in a loop.
- **Investment / brokerage statements** (JPM Self-Directed Investing, Schwab, Fidelity, Vanguard): these have a fundamentally different schema — cost basis, gain/loss, asset allocation, holdings — that does not map to a transaction-with-amount table. **Do not parse these as bank statements.** Detect them (look for `INVESTMENT STATEMENT`, `BROKERAGE`, `J.P. MORGAN SECURITIES`, `Account Value`, `Realized Gain / Loss`), and in the run summary, list them as "skipped — investment statement, not in scope" so the user knows. If the user wants brokerage transactions extracted (cash flows like ACH-in/out, dividends, sells), ask whether they want a stripped-down rendering: just the cash activity rows, with security trades represented by their net cash impact only, no cost basis or gain/loss.
- **Statement period spanning year boundary**: if statement period is e.g. 12/15/2024 - 01/14/2025, transactions dated "12/xx" get year 2024 and "01/xx" get year 2025.
- **Credit card "previous balance" / "new balance" lines**: not transactions — skip them.
- **Pending transactions section**: if a statement has a "Pending" section, skip it (these aren't posted yet and will appear on the next statement).
- **Foreign currency / FX adjustments**: include them as separate rows exactly as printed; categorize as `Fees & Charges` / `Foreign Transaction` if a separate fee line, or as the original purchase if it's an FX-converted amount.
- **Check images / deposit detail pages**: not transactions — skip.
- **Interest charges / finance charges**: include as transactions with Category=`Fees & Charges`, Sub-category=`Interest`.

## What NOT to do

- Do NOT change the 10-column schema (Date / Account / Account # / Source / Category / Sub-category / Amount / Balance / Stmt period / Source file). Even if a statement has extra useful fields (check number, posted date vs transaction date), don't add columns to the master — it breaks append-compatibility across runs.
- Do NOT populate the Category / Sub-category columns. They stay blank — categorization is out of scope for this skill. If you see code that calls a categorize() function or hardcodes category strings, that's stale and should be removed.
- Do NOT silently fix what looks like extraction errors. If a transaction amount looks suspicious (e.g., the parser produced something obviously wrong), note it in the run summary rather than guessing or papering over it.
- Do NOT rasterize pages by default for text-extractable PDFs — it's wasteful. Only fall back to vision when `pdftotext` fails.
- Do NOT invent a running balance if the statement doesn't print one. Leave Balance blank rather than computing it — the user is a forensic accountant and synthetic balances will mislead reconciliation.

## Reference files

- `references/bank_formats.md` — Layout patterns for Apple Card, Chase Checking, Chase Card, Discover, Gain FCU, and a generic regex fallback. Read this before parsing.
- `scripts/parse_statements.py` — Reference multi-format parser implementing the issuer-detection-and-dispatch pattern, with working parsers for all the supported issuers above. Read this — don't rewrite it. Lift the `parse_one(text_path)` function into your run script.
- `scripts/build_master.py` — Reference implementation for creating/appending the master xlsx.
