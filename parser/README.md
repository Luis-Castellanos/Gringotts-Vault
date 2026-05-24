# bank-statement-extractor

Parse bank and credit card statement PDFs into a tabular `.xlsx` file. Position-aware extraction using `pdftotext` and `pdfplumber`. No categorization — pure extraction; downstream tools handle classification.

## Supported issuers

- Apple Card (Goldman Sachs)
- Chase Checking
- Chase Credit Cards (Sapphire, Freedom, Prime/Amazon)
- Discover
- Gain Federal Credit Union

JPM Self-Directed Investing / brokerage statements are detected and deferred — they have a fundamentally different schema.

## Output schema

10 columns: `Date | Account | Account # | Source | Category | Sub-category | Amount | Balance | Stmt period | Source file`

Category and Sub-category are intentionally **left blank**. The parser's job is extraction only.

## Quick start

```bash
pip install pdfplumber openpyxl
# pdftotext from poppler also required
```

```python
from parse_statements import parse_one
from build_master import build_or_append

# 1. Convert PDF → text with `pdftotext -layout statement.pdf statement.txt`
# 2. Then:
txns, stmt_period, issuer = parse_one(
    "statement.txt",
    original_pdf_filename="statement.pdf",
    pdf_path="statement.pdf",
)
result = build_or_append(txns, "master.xlsx", existing_path="master.xlsx")
```

## Repository layout

- `SKILL.md` — operational instructions
- `references/bank_formats.md` — per-issuer layout patterns and known quirks (multi-cardholder Apple Card sections, Apple Card Monthly Installments, CSV-vs-PDF discrepancies)
- `scripts/parse_statements.py` — issuer-detection + dispatch parser
- `scripts/build_master.py` — xlsx append helper with duplicate detection and schema migration

## Status

Personal project. Tested against ~75 real-world statements (Apple Card 2020-2026, mixed Chase and Discover). The Apple Card pdfplumber parser handles multi-cardholder sub-sections, ACMI installment plans, and row-clustering edge cases.
