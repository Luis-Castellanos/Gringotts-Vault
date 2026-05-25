"""
Multi-format bank statement parser — REFERENCE IMPLEMENTATION.

Read this file to understand the issuer-detection + dispatch pattern, the
per-issuer parsers, and the categorization approach. Copy the relevant
parts into your run script; don't run this file directly.

Detects issuer from the PDF text and dispatches to format-specific parsing.
Currently supports:
  - Apple Card (Goldman Sachs)
  - Chase Checking
  - Chase Credit Card (Sapphire/Prime/Freedom)
  - Discover Card
  - Gain Federal Credit Union (loan/deposit account)

Investment statements (e.g. JPM Self-Directed Investing) are detected and
deferred — they require a different schema (cost basis, gain/loss,
holdings) and should not be force-fit into the bank-statement schema.

USAGE:
    from parse_statements import parse_one
    transactions, stmt_period_str, issuer = parse_one("/path/to/statement.txt")

The .txt should be the output of `pdftotext -layout statement.pdf -`.
"""
import re
from datetime import date, datetime
from pathlib import Path

# This parser intentionally does NOT categorize transactions. Category and
# Sub-category fields on each transaction dict are emitted as empty strings;
# downstream tools fill them in. Keeping the keys preserves the master.xlsx
# 10-column schema (Category / Sub-category columns stay blank for rows the
# parser writes).


# ---------- Issuer detection ----------
def detect_issuer(text: str) -> str:
    head = text[:5000].upper()
    body = text.upper()  # full-body scan; some markers fall past the 5000-char head
    if "APPLE CARD" in head and "GOLDMAN" in head:
        return "apple_card"
    if "DISCOVER IT" in head or "DISCOVER CARD" in head:
        return "discover"
    if "GAIN FEDERAL CREDIT UNION" in head or "GAINFCU" in head:
        return "gain_fcu"
    # Investment / brokerage issuers (holdings statements). Checked before the
    # bank/card branches since some carry overlapping brand text. Order matters:
    # Empower 401k statements *hold* Fidelity funds (e.g. "Fidelity 500 Index"),
    # so match Empower before Fidelity, and key Fidelity on its own statement
    # header (INVESTMENT REPORT / NFS), never on a holding's name.
    if "EMPOWER" in head and ("HOW IS MY ACCOUNT INVESTED" in body
                              or "PLAN NUMBER" in head or "VESTED BALANCE" in body):
        return "empower"
    if "OPTUM" in head and ("HSA" in head or "HEALTH SAVINGS" in body):
        return "optum_hsa"
    if "FIDELITY" in head and ("INVESTMENT REPORT" in body
                               or "NATIONAL FINANCIAL SERVICES" in body):
        return "fidelity"
    # Other institutions — checked before the Chase branches (these carry their
    # own brand markers; some otherwise misdetect as chase_card on generic text).
    if "AMERICAN EXPRESS" in body and "REWARDS CHECKING" in body:
        return "amex_checking"
    if "AMERICAN EXPRESS NATIONAL BANK" in body and ("SAVINGS" in body or "HIGH YIELD" in body or "SUMMARY OF MY ACCOUNTS" in body):
        return "amex_hysa"
    if "CITI" in head and ("SIMPLICITY" in head or "CITI" in body and "BILLING PERIOD" in body and "MINIMUM PAYMENT" in body):
        return "citi_card"
    if "CAPITAL ONE 360" in body or ("CAPITAL ONE" in body and "CAPITALONE.COM" in body):
        return "capital_one"
    if "DAILY CASH DEPOSIT" in body and "GOLDMAN" in body and "SAVINGS" in body and "APPLE CARD" not in head:
        return "apple_savings"
    if ("ALLY BANK" in body or "ALLY.COM" in body) and ("CUSTOMER STATEMENT" in body or "ENDING BALANCE" in body):
        return "ally"
    if "SCHWAB BANK" in body or "CHARLES SCHWAB" in body:
        return "schwab_checking"
    if "BANK OF AMERICA" in body or "BANKOFAMERICA.COM" in body:
        # Checking vs credit card — distinct sections.
        if "DEPOSITS AND OTHER ADDITIONS" in body or "WITHDRAWALS AND OTHER SUBTRACTIONS" in body:
            return "boa_checking"
        return "boa_card"
    # Chase loan statements (mortgage / auto) — check before the Chase
    # deposit/card branches, which would otherwise claim them on "Chase" alone.
    if "MORTGAGE STATEMENT" in head and ("UNPAID PRINCIPAL" in body or "CHASE" in body or "ESCROW" in body):
        return "chase_mortgage"
    if "CHASE AUTO" in body and ("VEHICLE" in head or "VIN" in body or "LOAN" in body):
        return "chase_auto"
    # IMPORTANT: check JPM investment BEFORE chase_card, since investment
    # statements contain Chase branding.
    if ("INVESTMENT STATEMENT" in head or "BROKERAGE" in head or
        "J.P. MORGAN SECURITIES" in head or "ACCOUNT VALUE" in head):
        return "jpm_investment"
    # Chase deposit-statement markers can fall past the 5000-char head, so these
    # use the full body. Specific to deposit statements — cards use ACCOUNT
    # ACTIVITY / PAYMENTS AND OTHER CREDITS, handled just below.
    if "JPMORGAN CHASE" in head and (
        "CHECKING" in head or "TRANSACTION DETAIL" in body
        or "CHECKING SUMMARY" in body or "SAVINGS SUMMARY" in body
    ):
        return "chase_checking"
    if "CHASE" in head and ("PAYMENTS AND OTHER CREDITS" in body or "ACCOUNT ACTIVITY" in body):
        return "chase_card"
    return "unknown"


# ---------- Helpers ----------
MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
    "JANUARY": 1, "FEBRUARY": 2, "MARCH": 3, "APRIL": 4, "JUNE": 6,
    "JULY": 7, "AUGUST": 8, "SEPTEMBER": 9, "OCTOBER": 10, "NOVEMBER": 11, "DECEMBER": 12,
}


def derive_account_info(filename: str, issuer: str, text: str = "") -> tuple[str, str]:
    """
    Derive (account_label, account_number) from filename and/or PDF text.

    account_label: human-readable label like 'Chase Checking 1234'
    account_number: the last-4 digits as a string (e.g. '1234'), or '' if unknown.
                    Stored as a string to preserve any leading zeros and to match
                    how Excel will display it in a TEXT-formatted cell.

    Strategy (in order):
    1. If filename matches the user's pattern (e.g.
       'Chase_Checking__1234__0110_2024_thru_0208_2024_.pdf'), parse it.
    2. Fall back to issuer + last-4 from PDF text if available.
    3. Fall back to issuer name with empty account number.
    """
    import re as _re
    stem = Path(filename).stem
    # Strip leading 8+ digit prefix (the upload-system ID)
    stem = _re.sub(r"^\d{8,}_", "", stem)

    # Try to extract <Bank_Name>__<LAST4>__<dates>
    m = _re.match(r"^([A-Za-z_]+?)__(\d{4})__", stem)
    if m:
        bank_part = m.group(1).replace("_", " ").strip()
        last4 = m.group(2)
        return f"{bank_part} {last4}", last4

    # Variant: "Bank Name #NNNN (...)" — spaces, hash, paren-wrapped date range
    m = _re.match(r"^([A-Za-z][A-Za-z ]+?)\s*#\s*(\d{4})\b", stem)
    if m:
        bank_part = m.group(1).strip()
        last4 = m.group(2)
        return f"{bank_part} {last4}", last4

    # Fall back: search the PDF text for "ending in NNNN" or "Account Number ...XXXX"
    issuer_label = {
        "apple_card": "Apple Card",
        "chase_checking": "Chase Checking",
        "chase_card": "Chase Card",
        "discover": "Discover",
        "gain_fcu": "Gain FCU",
        "jpm_investment": "JPM Investment",
        "amex_checking": "Amex Checking",
        "amex_hysa": "Amex HYSA",
        "citi_card": "Citi",
        "capital_one": "Capital One",
        "boa_card": "BOA Card",
        "boa_checking": "Bank of America",
        "apple_savings": "Apple Savings",
        "schwab_checking": "Schwab Checking",
        "ally": "Ally",
        "chase_mortgage": "Chase Mortgage",
        "chase_auto": "Chase Auto",
        "unknown": "Unknown",
    }.get(issuer, issuer)

    if text:
        m_last4 = _re.search(r"(?:ending in|Card Ending IN|Account Number[:\s]+\S*?)(\d{4})\b",
                             text[:8000], _re.IGNORECASE)
        if m_last4:
            last4 = m_last4.group(1)
            return f"{issuer_label} {last4}", last4

    return issuer_label, ""


# Backwards-compatible wrapper (older code may import the old name)
def derive_account_label(filename: str, issuer: str, text: str = "") -> str:
    label, _ = derive_account_info(filename, issuer, text)
    return label


def clean_amount(s: str) -> float:
    s = s.replace("$", "").replace(",", "").strip()
    # Handle "(123.45)" parenthesized negatives
    if s.startswith("(") and s.endswith(")"):
        return -float(s[1:-1])
    return float(s)


def assign_year(month: int, start_year: int, end_year: int, start_month: int, end_month: int) -> int:
    """Assign correct year to a transaction date based on statement period."""
    if start_year == end_year:
        return start_year
    # Year-end statement: months >= start_month belong to start_year, else end_year
    return start_year if month >= start_month else end_year


# ---------- Apple Card parser ----------
# Apple Card PDFs from Goldman Sachs use a tight grid where Date, Description,
# Daily Cash, and Amount columns align horizontally. pdftotext -layout often
# splits a single row across multiple output lines — a transaction's Amount
# can land on the line above or below its date row, and the section's Total
# amount can land mid-section instead of at the end. So we don't try to match
# date + amount on the same line. Instead, within each section we collect:
#   - all date rows (with descriptions stripped of Daily Cash / amount)
#   - all "right-column" $ amounts in document order (excluding Daily Cash,
#     identified by a preceding "N%")
# Then pair 1:1. If exactly one extra amount equals half the running sum,
# it's the section total — drop it.

_APPLE_END_MARKERS = (
    "Total payments",
    "Total charges",
    "Total Daily Cash",
    "Daily Cash from Apple",
    "Interest Charged",
    "Interest Charge Calculation",
    "Apple Card is issued",
)


def _apple_collect_section(lines: list[str]) -> tuple[list[tuple[date, str]], list[float]]:
    """Walk one Apple Card section's lines; return (date_entries, right_col_amounts).

    date_entries: list of (txn_date, description). Description has Daily Cash
        and any trailing amount stripped.
    right_col_amounts: $ amounts on these lines that are NOT Daily Cash, in
        document order. May include the section total as one extra entry.
    """
    date_entries: list[tuple[date, str]] = []
    amounts: list[float] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if any(stripped.startswith(m) for m in _APPLE_END_MARKERS):
            break
        # NOTE: do NOT `continue` on the column-header line ("Date Description …
        # Amount") or the "Promo Daily Cash" continuation row — pdftotext can
        # misalign a real right-column $ value onto either of them, and we'd
        # silently drop a transaction. Just let date detection fail naturally
        # (no MM/DD/YYYY on those lines) and still scan for $ amounts below.

        m_date = re.match(r"^\s*(\d{2}/\d{2}/\d{4})\s+(.+?)$", line)
        if m_date:
            date_str, rest = m_date.groups()
            txn_date = datetime.strptime(date_str, "%m/%d/%Y").date()
            # Strip "N% $X.XX" Daily Cash and everything after
            desc = re.sub(r"\s+\d+%\s+\$[\d,]+\.\d{2}.*$", "", rest)
            # Strip any trailing right-column amount left over
            desc = re.sub(r"\s+-?\$[\d,]+\.\d{2}\s*$", "", desc).strip()
            date_entries.append((txn_date, desc))

        # Collect right-column $ amounts: remove Daily Cash patterns first,
        # then take whatever $ figures remain.
        without_dc = re.sub(r"\d+%\s+\$[\d,]+\.\d{2}", "", line)
        for m_amt in re.finditer(r"-?\$[\d,]+\.\d{2}", without_dc):
            amounts.append(clean_amount(m_amt.group()))

    return date_entries, amounts


def _apple_drop_section_total(amounts: list[float]) -> list[float]:
    """If at least one amount equals half the sum (i.e. equals sum of others),
    it's the section total — drop one such occurrence. Otherwise return
    amounts unchanged.

    Why allow >1 match: when a section has a single transaction, the section
    total equals that transaction's amount, so both values match half-sum.
    Dropping either is correct (they're equal). For sections with 2+ real
    transactions, len(matches) is almost always 1.
    """
    if not amounts:
        return amounts
    total = sum(amounts)
    half = total / 2
    for i, a in enumerate(amounts):
        if abs(a - half) < 0.005:
            return amounts[:i] + amounts[i + 1:]
    return amounts


_APPLE_PERIOD_RE = re.compile(
    r"([A-Z][a-z]{2})\s+(\d{1,2})\s*[—–\-]+\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})"
)


def _apple_parse_period(text: str) -> tuple[date, date, str]:
    """Parse the Apple Card statement-period header. Returns (start, end, formatted)."""
    m = _APPLE_PERIOD_RE.search(text)
    if not m:
        raise ValueError("Apple Card: could not find statement period")
    s_mon, s_day, e_mon, e_day, year = m.groups()
    year = int(year)
    s_month = MONTHS[s_mon.upper()]
    e_month = MONTHS[e_mon.upper()]
    s_year = year - 1 if s_month > e_month else year
    start = date(s_year, s_month, int(s_day))
    end = date(year, e_month, int(e_day))
    return start, end, f"{start.strftime('%m/%d/%Y')} - {end.strftime('%m/%d/%Y')}"


_INSTALLMENT_AMOUNT_RE = re.compile(
    r"This month.s installment:\s*\$([\d,]+\.\d{2})"
)
_INSTALLMENTS_END_MARKERS = (
    "Total payments and credits",
    "Total financed",
    "Daily Cash from Apple",
    "Total Daily Cash",
    "Apple Card is issued",
)


def _cluster_words_by_y(words, tolerance: float = 3.0):
    """Greedy 1-D clustering on `top`. Words within `tolerance` pixels of an
    existing cluster's anchor join it; otherwise a new cluster starts. This
    fixes the rare case where pdfplumber places a row's date+description and
    its amount at top values 1 pixel apart, which `round(top)` would split
    into two separate "rows" (and the date row would be dropped because it
    has no amount, while the amount row would be dropped because it has no
    date).
    """
    from collections import defaultdict
    rows = defaultdict(list)
    anchor: float | None = None
    for w in sorted(words, key=lambda x: x["top"]):
        if anchor is None or w["top"] - anchor > tolerance:
            anchor = w["top"]
        rows[anchor].append(w)
    return rows


def parse_apple_card_pdfplumber(pdf_path) -> tuple[list[dict], str]:
    """Position-aware Apple Card parser using pdfplumber.

    Why this exists: pdftotext -layout vertically misaligns the Apple Card grid
    so badly that amounts can land on the row above/below their date, and
    section totals can land mid-section. Worse, RETURN transactions have a
    "Daily Cash Adjustment" sub-row whose Amount-column $ is a real
    sub-transaction — line-based parsing can't reliably attach that $ to the
    parent date. With pdfplumber we cluster words by y-coordinate (`top`), so
    each visual row stays intact and the rightmost $ on the row is
    unambiguously the Amount-column value.
    """
    import pdfplumber

    end_markers = (
        "Total payments for this period",
        "Total Daily Cash this month",
        "Total charges, credits and returns",
    )
    transactions: list[dict] = []
    stmt_str: str | None = None
    stmt_end: date | None = None  # for assigning installment txn dates
    section: str | None = None
    last_date: date | None = None  # for sub-rows that share the parent's date
    current_installment_merchant: str | None = None

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if stmt_str is None:
                try:
                    _, stmt_end, stmt_str = _apple_parse_period(page_text)
                except ValueError:
                    pass

            words = page.extract_words()
            # The Apple Card grid has two $-bearing columns: Daily Cash (~70%
            # across) and Amount (~90% across). To avoid grabbing a Daily Cash
            # value when a row has no Amount-column $ (e.g. "Promo Daily Cash
            # 1% $0.26"), require the picked $ to live in the rightmost ~20%
            # of the page.
            amount_col_min_x = page.width * 0.8

            rows = _cluster_words_by_y(words, tolerance=3.0)

            for top in sorted(rows.keys()):
                row_words = sorted(rows[top], key=lambda w: w["x0"])
                row_text = " ".join(w["text"] for w in row_words).strip()

                # Apple Card repeats the section header ("Payments" /
                # "Transactions") on every continuation page. Only reset
                # last_date when actually entering a new section — otherwise
                # a Daily Cash Adjustment sub-row landing first on a
                # continuation page loses its parent's date.
                #
                # Multi-cardholder statements split each top-level section
                # into per-name sub-sections ("Transactions by <Name>",
                # "Payments made by <Name>"). The first sub-section ends with
                # a "Total charges, credits and returns" marker; without
                # matching the next cardholder's header we'd silently drop
                # their rows.
                new_section: str | None = None
                if (row_text == "Payments"
                        or row_text.startswith("Payments by ")
                        or row_text.startswith("Payments made by ")):
                    new_section = "payments"
                elif (row_text == "Transactions"
                        or row_text.startswith("Transactions by ")
                        or row_text.startswith("Transactions made by ")):
                    new_section = "purchases"
                elif (row_text == "Apple Card Monthly Installments"
                        or row_text.startswith("Apple Card Installments by ")):
                    new_section = "installments"
                if new_section is not None:
                    if section != new_section:
                        last_date = None
                        current_installment_merchant = None
                    section = new_section
                    continue
                # Installments section has its own end-marker set; the main
                # `end_markers` would prematurely terminate a payments section
                # on lines like "Total payments and credits".
                if section == "installments":
                    if any(row_text.startswith(em) for em in _INSTALLMENTS_END_MARKERS):
                        section = None
                        current_installment_merchant = None
                        continue
                else:
                    if any(row_text.startswith(em) for em in end_markers):
                        section = None
                        continue
                if section is None:
                    continue

                # Installments section: format differs from purchases/payments.
                # Each plan has an optional date row (purchase date + merchant
                # + remaining financed) followed by:
                #     TRANSACTION #<id>
                #     This month's installment: $XX.XX
                #     Final installment: <date>
                # We emit one txn per "This month's installment" line, dated
                # at the statement close (= when the installment is charged).
                if section == "installments":
                    # Track the most recent purchase-merchant from a date row,
                    # so the emitted txn carries useful descriptive context.
                    # Installment date rows include the Daily Cash column
                    # ("N% $X.XX") and a trailing remaining-financed amount;
                    # strip both, keeping only merchant words.
                    if re.match(r"^\d{2}/\d{2}/\d{4}\s+", row_text):
                        merchant_words = [
                            w["text"] for w in row_words[1:]
                            if not re.fullmatch(r"-?\d+%", w["text"])
                            and not re.fullmatch(r"-?\$[\d,]+\.\d{2}", w["text"])
                        ]
                        merchant = " ".join(merchant_words).strip()
                        current_installment_merchant = merchant or None
                        continue
                    m_inst = _INSTALLMENT_AMOUNT_RE.search(row_text)
                    if m_inst and stmt_end is not None:
                        amt = float(m_inst.group(1).replace(",", ""))
                        merch = (
                            f" - {current_installment_merchant}"
                            if current_installment_merchant else ""
                        )
                        desc = f"Apple Card Monthly Installment{merch}"
                        transactions.append({
                            "date": stmt_end,
                            "source": desc,
                            "category": "",
                            "subcategory": "",
                            "amount": -round(amt, 2),  # debit
                            "balance": None,
                            "stmt_period": stmt_str,
                        })
                    continue

                amount_words = [
                    w for w in row_words
                    if re.fullmatch(r"-?\$[\d,]+\.\d{2}", w["text"])
                    and w["x0"] >= amount_col_min_x
                ]
                if not amount_words:
                    continue

                amt = clean_amount(max(amount_words, key=lambda w: w["x0"])["text"])

                first = row_words[0]["text"]
                if re.fullmatch(r"\d{2}/\d{2}/\d{4}", first):
                    txn_date = datetime.strptime(first, "%m/%d/%Y").date()
                    last_date = txn_date
                    is_date_row = True
                elif last_date is not None:
                    txn_date = last_date
                    is_date_row = False
                else:
                    continue

                desc_parts = []
                for w in row_words:
                    t = w["text"]
                    if is_date_row and t == first:
                        continue
                    if re.fullmatch(r"-?\d+%", t):
                        continue
                    if re.fullmatch(r"-?\$[\d,]+\.\d{2}", t):
                        continue
                    desc_parts.append(t)
                desc = " ".join(desc_parts).strip()
                if not desc:
                    continue

                # Preserve the printed sign, then flip for our schema. Apple
                # Card prints purchases positive, returns negative, payments
                # negative, and Daily Cash Adjustments positive. In our schema
                # negative = balance increase (debit) and positive = balance
                # decrease (credit). Negating the printed amount yields the
                # right balance impact for all four cases.
                signed = -amt
                transactions.append({
                    "date": txn_date,
                    "source": desc,
                    "category": "",
                    "subcategory": "",
                    "amount": round(signed, 2),
                    "balance": None,
                    "stmt_period": stmt_str,
                })

    if stmt_str is None:
        raise ValueError("Apple Card: could not find statement period on any page")
    return transactions, stmt_str


def parse_apple_card(text: str) -> tuple[list[dict], str]:
    """Text-based Apple Card parser (fallback). Use parse_apple_card_pdfplumber
    when you have the PDF — it handles RETURN-with-Daily-Cash-Adjustment rows
    and other layouts this function can't.
    """
    start, end, stmt_str = _apple_parse_period(text)

    lines = text.splitlines()
    payments_start = transactions_start = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped == "Payments" and payments_start is None:
            payments_start = i + 1
        elif stripped == "Transactions" and transactions_start is None:
            transactions_start = i + 1

    transactions: list[dict] = []

    def emit(section: str, dates: list[tuple[date, str]], amounts: list[float]) -> None:
        if len(amounts) > len(dates):
            amounts = _apple_drop_section_total(amounts)
        if len(dates) != len(amounts):
            raise ValueError(
                f"Apple Card {section}: {len(dates)} dates vs {len(amounts)} amounts — "
                "layout extraction may have shifted a value out of the section"
            )
        for (txn_date, desc), amt in zip(dates, amounts):
            signed = abs(amt) if section == "payments" else -abs(amt)
            transactions.append({
                "date": txn_date, "source": desc, "category": "",
                "subcategory": "", "amount": round(signed, 2),
                "balance": None, "stmt_period": stmt_str,
            })

    if payments_start is not None:
        end_idx = transactions_start - 1 if transactions_start else len(lines)
        d, a = _apple_collect_section(lines[payments_start:end_idx])
        emit("payments", d, a)

    if transactions_start is not None:
        d, a = _apple_collect_section(lines[transactions_start:])
        emit("purchases", d, a)

    return transactions, stmt_str


# ---------- Chase Checking parser ----------
def parse_chase_checking(text: str) -> tuple[list[dict], str]:
    # Statement period: "January 10, 2024 through February 08, 2024"
    m = re.search(
        r"(\w+)\s+(\d{1,2}),\s*(\d{4})\s+through\s+(\w+)\s+(\d{1,2}),\s*(\d{4})",
        text,
    )
    if not m:
        raise ValueError("Chase Checking: could not find statement period")
    s_mon, s_day, s_year, e_mon, e_day, e_year = m.groups()
    start = date(int(s_year), MONTHS[s_mon.upper()], int(s_day))
    end = date(int(e_year), MONTHS[e_mon.upper()], int(e_day))
    stmt_str = f"{start.strftime('%m/%d/%Y')} - {end.strftime('%m/%d/%Y')}"

    def add(date_str, desc, amt, bal):
        month, day = [int(x) for x in date_str.split("/")]
        year = assign_year(month, start.year, end.year, start.month, end.month)
        transactions.append({
            "date": date(year, month, day), "source": desc.strip(), "category": "",
            "subcategory": "", "amount": round(amt, 2),
            "balance": (None if bal is None else round(bal, 2)), "stmt_period": stmt_str,
        })

    transactions = []

    # Preferred path — derive amounts from the printed RUNNING BALANCE
    # (`amount[i] = balance[i] - balance[i-1]`) rather than the amount column:
    # pdftotext -layout detaches deposit amounts onto their own line, so the
    # amount column is unreliable, but every row prints a running balance.
    # Bound the list with Chase's *start*/*end* markers so the daily-ending-
    # balance ledger and the summary stay out. Anchor on the stated beginning
    # balance.
    if "*start*transaction detail" in text.lower():
        mb = re.search(r"Beginning Balance\s+(-?\$?-?[\d,]+\.\d{2})", text)
        prev_balance = clean_amount(mb.group(1)) if mb else None
        num_re = re.compile(r"-?\$?[\d,]+\.\d{2}")
        in_detail = False
        for raw in text.splitlines():
            low = raw.strip().lower()
            if "*start*transaction detail" in low:
                in_detail = True
                continue
            if "*end*transaction detail" in low:
                in_detail = False
                continue
            if not in_detail or not low:
                continue
            if low.startswith("beginning balance") or low.startswith("ending balance"):
                continue
            m_line = re.match(r"^\s*(\d{2}/\d{2})\s+(.+)$", raw.rstrip())
            if not m_line:
                continue  # continuation / orphaned-amount line (no leading date)
            date_str, rest = m_line.groups()
            nums = num_re.findall(rest)
            if not nums:
                continue  # a dated line with no running balance isn't a transaction
            bal = clean_amount(nums[-1])
            desc = re.sub(r"\s*(?:-?\$?[\d,]+\.\d{2}\s*)+$", "", rest).strip()
            # Derive amount from the balance delta; fall back to the printed
            # amount column only if we never found an anchor balance.
            amt = (bal - prev_balance) if prev_balance is not None \
                else (clean_amount(nums[-2]) if len(nums) >= 2 else 0.0)
            prev_balance = bal
            add(date_str, desc, amt, bal)
        return transactions, stmt_str

    # Legacy fallback (no *start*/*end* markers): match the two-number line
    # "MM/DD  description  AMOUNT  BALANCE" directly. Preserves prior behavior
    # for any layout that lacks the markers (and avoids the daily-ledger trap).
    in_detail = False
    for raw in text.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if "TRANSACTION DETAIL" in stripped.upper() and "Beginning" not in stripped:
            in_detail = True
            continue
        if not in_detail or not stripped:
            continue
        if stripped.startswith("Beginning Balance") or stripped.startswith("Ending Balance"):
            continue
        m_line = re.match(r"^\s*(\d{2}/\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$", line)
        if not m_line:
            continue
        date_str, desc, amount_str, balance_str = m_line.groups()
        add(date_str, desc, clean_amount(amount_str), clean_amount(balance_str))
    return transactions, stmt_str


# ---------- Chase Card parser ----------
def parse_chase_card(text: str) -> tuple[list[dict], str]:
    # Statement period: "Opening/Closing Date  02/05/21 - 03/04/21"
    m = re.search(
        r"Opening/Closing Date\s+(\d{2}/\d{2}/\d{2,4})\s*-\s*(\d{2}/\d{2}/\d{2,4})",
        text,
    )
    if not m:
        raise ValueError("Chase Card: could not find Opening/Closing Date")
    s_str, e_str = m.groups()

    def parse_2or4_year(s: str) -> date:
        parts = s.split("/")
        m_, d_, y_ = int(parts[0]), int(parts[1]), int(parts[2])
        if y_ < 100:
            y_ += 2000
        return date(y_, m_, d_)
    start = parse_2or4_year(s_str)
    end = parse_2or4_year(e_str)
    stmt_str = f"{start.strftime('%m/%d/%Y')} - {end.strftime('%m/%d/%Y')}"

    transactions = []
    section = None  # 'credits' | 'purchases'
    for raw in text.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        upper = stripped.upper()
        if upper == "PAYMENTS AND OTHER CREDITS":
            section = "credits"
            continue
        if upper in ("PURCHASE", "PURCHASES"):
            section = "purchases"
            continue
        if upper.startswith("INTEREST CHARGE") or upper.startswith("FEES CHARGED"):
            section = "fees"
            continue
        if upper.startswith("TOTAL ") or upper.startswith("ACCOUNT ACTIVITY"):
            continue
        if section is None:
            continue

        # Skip "Order Number ..." continuation lines
        if stripped.startswith("Order Number") or stripped.startswith("ORDER NUMBER"):
            continue

        # Line: "MM/DD   description   AMOUNT" (amount may be negative for credits)
        m_line = re.match(r"^\s*(\d{2}/\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s*$", line)
        if not m_line:
            continue
        date_str, desc, amount_str = m_line.groups()
        month, day = [int(x) for x in date_str.split("/")]
        year = assign_year(month, start.year, end.year, start.month, end.month)
        txn_date = date(year, month, day)
        amt = clean_amount(amount_str)

        # Chase credit card: payments/credits are pre-signed negative on the
        # statement (e.g. "-39.53"). In our schema, payments TO the card are
        # POSITIVE (they reduce the balance owed = credit). Purchases are
        # printed positive; we flip them to negative.
        if section == "credits":
            signed_amt = abs(amt)  # flip negative to positive
        elif section == "purchases":
            signed_amt = -abs(amt)
        else:  # fees / interest
            signed_amt = -abs(amt)

        transactions.append({
            "date": txn_date, "source": desc.strip(), "category": "",
            "subcategory": "", "amount": round(signed_amt, 2),
            "balance": None, "stmt_period": stmt_str,
        })
    return transactions, stmt_str


# ---------- Discover parser ----------
def parse_discover(text: str) -> tuple[list[dict], str]:
    # Statement period: "OPEN TO CLOSE DATE: 03/03/2023 - 04/02/2023"
    # or "03/03/2023 - 04/02/2023" near top
    m = re.search(r"(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})", text)
    if not m:
        raise ValueError("Discover: could not find statement period")
    start = datetime.strptime(m.group(1), "%m/%d/%Y").date()
    end = datetime.strptime(m.group(2), "%m/%d/%Y").date()
    stmt_str = f"{start.strftime('%m/%d/%Y')} - {end.strftime('%m/%d/%Y')}"

    transactions = []
    section = None
    seen_txn_header = False
    interest_total = None

    for raw in text.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        upper = stripped.upper()
        if upper == "TRANSACTIONS":
            seen_txn_header = True
            continue
        # Section headers: "DATE   PAYMENTS AND CREDITS   AMOUNT"
        # and "DATE   PURCHASES   MERCHANT CATEGORY   AMOUNT"
        # These are column-header lines that include the section name.
        if "PAYMENTS AND CREDITS" in upper and "AMOUNT" in upper:
            section = "credits"
            continue
        if "PURCHASES" in upper and "MERCHANT CATEGORY" in upper and "AMOUNT" in upper:
            section = "purchases"
            continue
        if upper.startswith("FEES AND INTEREST CHARGED"):
            section = None
            continue
        if upper.startswith("TOTAL INTEREST FOR THIS PERIOD"):
            m_int = re.search(r"\$([\d,]+\.\d{2})", stripped)
            if m_int:
                interest_total = clean_amount(m_int.group(1))
            continue

        if section is None:
            continue

        # Discover format: "MM/DD   DESCRIPTION   [MERCHANT CATEGORY]   $AMOUNT"
        # CAREFUL: the right side of the page has a "Cashback Bonus Rewards" column
        # that prints +$1.09 etc. on the SAME line as the transaction. We must match
        # the FIRST amount (the transaction amount), not the last.
        m_line = re.match(r"^\s*(\d{2}/\d{2})\s+(.+?)\s{2,}(-?\$[\d,]+\.\d{2})(?:\s|$)", line)
        if not m_line:
            continue
        date_str, rest, amount_str = m_line.groups()
        month, day = [int(x) for x in date_str.split("/")]
        year = assign_year(month, start.year, end.year, start.month, end.month)
        txn_date = date(year, month, day)
        amt = clean_amount(amount_str)

        # For purchases, the line has "DESCRIPTION  MERCHANT_CATEGORY  $AMOUNT"
        # The merchant category is one of a few standard values (Merchandise,
        # Restaurants, Services, Travel/Entertainment, Supermarkets, Gasoline,
        # Department Stores, Medical Services, Government Services, Education,
        # Home Improvement). Strip these from the end of `rest`.
        desc = rest.strip()
        category_words = [
            "Merchandise", "Restaurants", "Services", "Travel/Entertainment",
            "Supermarkets", "Gasoline", "Department Stores", "Medical Services",
            "Government Services", "Education", "Home Improvement",
            "Awards & Rebate Credits",
        ]
        for cw in category_words:
            if desc.endswith(cw):
                desc = desc[:-len(cw)].strip()
                break

        # Discover signs payments as "-$83.00" already negative.
        # For our schema: payments to card are positive, purchases are negative.
        if section == "credits":
            signed_amt = abs(amt)  # flip
        else:  # purchases
            signed_amt = -abs(amt)

        transactions.append({
            "date": txn_date, "source": desc, "category": "",
            "subcategory": "", "amount": round(signed_amt, 2),
            "balance": None, "stmt_period": stmt_str,
        })

    # Add interest charge as a synthetic transaction if non-zero
    if interest_total and interest_total > 0:
        transactions.append({
            "date": end,
            "source": "INTEREST CHARGE ON PURCHASES",
            "category": "",
            "subcategory": "",
            "amount": -round(interest_total, 2),
            "balance": None,
            "stmt_period": stmt_str,
        })

    return transactions, stmt_str


# ---------- Gain FCU parser ----------
def parse_gain_fcu(text: str) -> tuple[list[dict], str]:
    # Statement period: "Statement For 03/01/2022 - 03/31/2022"
    m = re.search(r"Statement For\s+(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})", text)
    if not m:
        raise ValueError("Gain FCU: could not find statement period")
    start = datetime.strptime(m.group(1), "%m/%d/%Y").date()
    end = datetime.strptime(m.group(2), "%m/%d/%Y").date()
    stmt_str = f"{start.strftime('%m/%d/%Y')} - {end.strftime('%m/%d/%Y')}"

    transactions = []
    # Gain has a transaction line format:
    # "MM/DD   Description...   -$AMOUNT   PRINCIPAL   INTEREST   FEES   BALANCE"
    # for loans, or simpler for deposits. We grab any line starting with MM/DD.
    for raw in text.splitlines():
        line = raw.rstrip()
        m_line = re.match(
            r"^\s*(\d{2}/\d{2})\s+(.+?)\s+(-?\$[\d,]+\.\d{2})(?:\s+-?\$?[\d,]+\.\d{2})*\s+(-?\$?[\d,]+\.\d{2})\s*$",
            line,
        )
        if not m_line:
            continue
        date_str, desc, amount_str, balance_str = m_line.groups()
        month, day = [int(x) for x in date_str.split("/")]
        year = assign_year(month, start.year, end.year, start.month, end.month)
        txn_date = date(year, month, day)
        amt = clean_amount(amount_str)
        bal = clean_amount(balance_str)
        transactions.append({
            "date": txn_date, "source": desc.strip(), "category": "",
            "subcategory": "", "amount": round(amt, 2),
            "balance": round(bal, 2), "stmt_period": stmt_str,
        })
    return transactions, stmt_str


# ---------- Dispatcher ----------
# ---------- Other institutions ----------
# Signed money token incl. ordering Amex/Citi/BOA use: "$88.00", "-$88.00",
# "1,234.56", "-1,234.56". Returns a signed float or None.
_SMONEY_RE = re.compile(r"-?\$?\s?-?[\d,]+\.\d{2}")


def _smoney(tok: str):
    t = tok.replace("$", "").replace(",", "").replace(" ", "")
    try:
        return float(t)
    except ValueError:
        return None


def _iso_mdy(d: str) -> str:
    """'01/15/2026' -> '2026-01-15'."""
    mm, dd, yy = d.split("/")
    if len(yy) == 2:
        yy = "20" + yy
    return f"{yy}-{mm.zfill(2)}-{dd.zfill(2)}"


def parse_amex_checking(text: str):
    """American Express Rewards Checking — bank deposit account. Rows:
    `MM/DD/YYYY  <desc>  <amount(credit + / debit -$)>  <running balance>`."""
    txns = []
    pm = re.search(r"(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})", text)
    stmt_str = f"{pm.group(1)} - {pm.group(2)}" if pm else ""
    for raw in text.splitlines():
        s = raw.strip()
        m = re.match(r"(\d{2}/\d{2}/\d{4})\s+(.+)", s)
        if not m:
            continue
        rest = m.group(2)
        low = rest.lower()
        if "beginning balance" in low or "ending balance" in low or "total " in low:
            continue
        amts = re.findall(r"-?\$[\d,]+\.\d{2}", rest)
        if len(amts) < 2:
            continue  # a real row carries the transaction amount + running balance
        amount, balance = _smoney(amts[0]), _smoney(amts[-1])
        if amount is None or balance is None:
            continue
        desc = rest[: rest.find(amts[0])].strip() or rest.split("  ")[0].strip()
        txns.append({"date": _iso_mdy(m.group(1)), "source": desc, "amount": round(amount, 2), "balance": round(balance, 2)})
    return txns, stmt_str


def parse_amex_hysa(text: str):
    """American Express National Bank High-Yield Savings. Same row shape as the
    checking account; interest credits show as positive amounts."""
    return parse_amex_checking(text)


def _billing_period_years(text: str):
    """(start_year, end_year, start_month, end_month) from a 'Billing Period:
    MM/DD/YY-MM/DD/YY' (Citi) or similar, for MM/DD rows that omit the year."""
    m = re.search(r"(\d{2})/(\d{2})/(\d{2,4})\s*[-–]\s*(\d{2})/(\d{2})/(\d{2,4})", text)
    if not m:
        return None
    sm, _sd, sy, em, _ed, ey = m.groups()
    norm = lambda y: int("20" + y) if len(y) == 2 else int(y)
    return norm(sy), norm(ey), int(sm), int(em)


def parse_citi_card(text: str):
    """Citi credit card. Rows: `MM/DD [MM/DD]  <desc>  <amount>`. Charges print
    positive, payments/credits negative — flip to Vault's card convention
    (spending negative, payments positive)."""
    txns = []
    per = _billing_period_years(text)
    bm = re.search(r"Billing Period:\s*(\d{2}/\d{2}/\d{2,4})\s*[-–]\s*(\d{2}/\d{2}/\d{2,4})", text)
    stmt_str = f"{bm.group(1)} - {bm.group(2)}" if bm else ""
    for raw in text.splitlines():
        s = raw.strip()
        m = re.match(r"(\d{2})/(\d{2})(?:\s+\d{2}/\d{2})?\s+([A-Za-z].+?)\s+(-?\$?[\d,]+\.\d{2})\s*$", s)
        if not m:
            continue
        mo, day, desc, amt = m.group(1), m.group(2), m.group(3).strip(), m.group(4)
        year = per[1] if per else datetime.now().year
        if per:
            year = assign_year(int(mo), per[0], per[1], per[2], per[3])
        val = _smoney(amt)
        if val is None:
            continue
        txns.append({"date": f"{year}-{mo}-{day}", "source": desc, "amount": round(-val, 2), "balance": None})
    return txns, stmt_str


def parse_boa_card(text: str):
    """Bank of America credit card. Rows: `MM/DD MM/DD <desc> <ref> <last4>
    <amount>`. Purchases print positive, payments negative — flip to Vault's card
    convention."""
    txns = []
    pm = re.search(r"(\d{2}/\d{2}/\d{4})\s*[-–]\s*(\d{2}/\d{2}/\d{4})", text)
    stmt_str = f"{pm.group(1)} - {pm.group(2)}" if pm else ""
    end_year = int(pm.group(2)[6:10]) if pm else datetime.now().year
    start_year = int(pm.group(1)[6:10]) if pm else end_year
    start_month = int(pm.group(1)[0:2]) if pm else 1
    end_month = int(pm.group(2)[0:2]) if pm else 12
    for raw in text.splitlines():
        s = raw.strip()
        m = re.match(r"(\d{2})/(\d{2})\s+\d{2}/\d{2}\s+(.+?)\s+(-?[\d,]+\.\d{2})\s*$", s)
        if not m:
            continue
        mo, day, desc, amt = m.group(1), m.group(2), m.group(3).strip(), m.group(4)
        val = _smoney(amt)
        if val is None:
            continue
        # Strip trailing reference/last-4 columns from the description.
        desc = re.sub(r"\s+\d{3,}\s+\d{3,}\s*$", "", desc).strip()
        year = assign_year(int(mo), start_year, end_year, start_month, end_month)
        txns.append({"date": f"{year}-{mo}-{day}", "source": desc, "amount": round(-val, 2), "balance": None})
    return txns, stmt_str


def parse_capital_one(text: str):
    """Capital One 360 (savings/checking). Activity rows where present:
    `MM/DD <desc> <amount> <balance>`; near-empty statements yield none."""
    txns = []
    pm = re.search(r"(\d{2}/\d{2}/\d{4})\s*[-–]\s*(\d{2}/\d{2}/\d{4})", text)
    stmt_str = f"{pm.group(1)} - {pm.group(2)}" if pm else ""
    end_year = int(pm.group(2)[6:10]) if pm else datetime.now().year
    for raw in text.splitlines():
        s = raw.strip()
        m = re.match(r"(\d{1,2})/(\d{1,2})\s+([A-Za-z].+?)\s+(-?\$?[\d,]+\.\d{2})(?:\s+(-?\$?[\d,]+\.\d{2}))?\s*$", s)
        if not m:
            continue
        low = m.group(3).lower()
        if "balance" in low or "total" in low:
            continue
        val = _smoney(m.group(4))
        bal = _smoney(m.group(5)) if m.group(5) else None
        if val is None:
            continue
        txns.append({"date": f"{end_year}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}", "source": m.group(3).strip(), "amount": round(val, 2), "balance": round(bal, 2) if bal is not None else None})
    return txns, stmt_str


def parse_apple_savings(text: str):
    """Apple Savings (Goldman). Rows: `MM/DD/YYYY <desc> <amount (deposit $ /
    withdrawal - $)>  <running balance>`."""
    txns = []
    pm = re.search(r"([A-Z][a-z]{2} \d{1,2}, \d{4})\s*[-–]\s*([A-Z][a-z]{2} \d{1,2}, \d{4})", text)
    stmt_str = f"{pm.group(1)} - {pm.group(2)}" if pm else ""
    amt_re = re.compile(r"-\s?\$[\d,]+\.\d{2}|\$[\d,]+\.\d{2}")
    for raw in text.splitlines():
        s = raw.strip()
        m = re.match(r"(\d{2}/\d{2}/\d{4})\s+(.+)", s)
        if not m:
            continue
        rest = m.group(2)
        low = rest.lower()
        if "opening balance" in low or "closing balance" in low or "ending balance" in low:
            continue
        hits = list(amt_re.finditer(rest))
        if len(hits) < 2:
            continue
        amount = _smoney(hits[0].group())
        balance = _smoney(hits[-1].group())
        if amount is None or balance is None:
            continue
        desc = rest[: hits[0].start()].strip()
        txns.append({"date": _iso_mdy(m.group(1)), "source": desc, "amount": round(amount, 2), "balance": round(balance, 2)})
    return txns, stmt_str


def parse_boa_checking(text: str):
    """Bank of America checking. Rows: `MM/DD/YY <desc> <amount>` — deposits
    print positive, withdrawals already carry a leading minus, so the row's
    signed amount is used directly (positive = money in)."""
    txns = []
    pm = re.search(r"(\w+ \d{1,2}, \d{4})\s+to\s+(\w+ \d{1,2}, \d{4})", text)
    stmt_str = f"{pm.group(1)} - {pm.group(2)}" if pm else ""
    for raw in text.splitlines():
        s = raw.strip()
        m = re.match(r"(\d{2})/(\d{2})/(\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s*$", s)
        if not m:
            continue
        desc = m.group(4).strip()
        low = desc.lower()
        if low.startswith(("total ", "beginning balance", "ending balance")):
            continue
        amount = _smoney(m.group(5))
        if amount is None:
            continue
        txns.append({"date": f"20{m.group(3)}-{m.group(1)}-{m.group(2)}", "source": desc, "amount": round(amount, 2), "balance": None})
    return txns, stmt_str


def _stmt_year_range(text: str):
    """(start_year, end_year, start_month, end_month) from a 'Month D, YYYY to
    Month D, YYYY' period, for MM/DD rows that omit the year."""
    m = re.search(r"(\w+) \d{1,2}, (\d{4})\s+to\s+(\w+) \d{1,2}, (\d{4})", text)
    if not m:
        return None
    sm = MONTHS.get(m.group(1).upper()[:3]) or MONTHS.get(m.group(1).upper())
    em = MONTHS.get(m.group(3).upper()[:3]) or MONTHS.get(m.group(3).upper())
    return int(m.group(2)), int(m.group(4)), sm or 1, em or 12


def parse_schwab_checking(text: str):
    """Schwab Bank checking. Rows: `MM/DD <desc> <amount> <running balance>`
    (MM/DD omits the year — taken from the statement period)."""
    txns = []
    yr = _stmt_year_range(text)
    pm = re.search(r"(\w+ \d{1,2}, \d{4})\s+to\s+(\w+ \d{1,2}, \d{4})", text)
    stmt_str = f"{pm.group(1)} - {pm.group(2)}" if pm else ""
    for raw in text.splitlines():
        s = raw.strip()
        m = re.match(r"(\d{1,2})/(\d{1,2})\s+([A-Za-z].+?)\s+(-?\$?[\d,]+\.\d{2})(?:\s+(-?\$?[\d,]+\.\d{2}))?\s*$", s)
        if not m:
            continue
        low = m.group(3).lower()
        if low.startswith(("beginning balance", "ending balance", "total ", "interest")):
            continue
        amount = _smoney(m.group(4))
        if amount is None:
            continue
        bal = _smoney(m.group(5)) if m.group(5) else None
        year = assign_year(int(m.group(1)), yr[0], yr[1], yr[2], yr[3]) if yr else datetime.now().year
        txns.append({"date": f"{year}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}", "source": m.group(3).strip(), "amount": round(amount, 2), "balance": round(bal, 2) if bal is not None else None})
    return txns, stmt_str


def parse_ally(text: str):
    """Ally Bank combined customer statement (savings + checking in one PDF).
    Rows: `MM/DD/YYYY <desc> <amount> <running balance>`. Deposits print
    positive, withdrawals negative."""
    txns = []
    pm = re.search(r"(\d{2}/\d{2}/\d{4})\s+thru\s+(\d{2}/\d{2}/\d{4})", text, re.IGNORECASE)
    stmt_str = f"{pm.group(1)} - {pm.group(2)}" if pm else ""
    amt_re = re.compile(r"-?\$[\d,]+\.\d{2}")
    for raw in text.splitlines():
        s = raw.strip()
        m = re.match(r"(\d{2}/\d{2}/\d{4})\s+(.+)", s)
        if not m:
            continue
        rest = m.group(2)
        low = rest.lower()
        if "beginning balance" in low or "ending balance" in low or low.startswith("total "):
            continue
        hits = amt_re.findall(rest)
        if len(hits) < 2:
            continue
        amount = _smoney(hits[0])
        balance = _smoney(hits[-1])
        if amount is None or balance is None:
            continue
        desc = rest[: rest.find(hits[0])].strip()
        txns.append({"date": _iso_mdy(m.group(1)), "source": desc, "amount": round(amount, 2), "balance": round(balance, 2)})
    return txns, stmt_str


PARSERS = {
    "apple_card": parse_apple_card,
    "chase_checking": parse_chase_checking,
    "chase_card": parse_chase_card,
    "discover": parse_discover,
    "gain_fcu": parse_gain_fcu,
    "amex_checking": parse_amex_checking,
    "amex_hysa": parse_amex_hysa,
    "citi_card": parse_citi_card,
    "boa_card": parse_boa_card,
    "boa_checking": parse_boa_checking,
    "capital_one": parse_capital_one,
    "apple_savings": parse_apple_savings,
    # ally + schwab_checking are recognized but deferred in parse_one (need
    # balance-delta signing); parse_ally / parse_schwab_checking are kept above
    # for when that lands.
}


# ---------- Statement summary (audit control totals) ----------
# The parser's job is to reconstruct AND self-verify: alongside the transaction
# rows, capture the statement's own STATED control totals (begin/end balance,
# deposit/withdrawal totals) so the audit page can reconcile stated-vs-derived
# independently. Fields are null when a format doesn't print them — or isn't
# extracted yet (the goal applies to every format; coverage grows as samples
# arrive). See references/bank_formats.md.

_EMPTY_SUMMARY = {
    "period_start": None, "period_end": None,
    "beginning_balance": None, "ending_balance": None,
    "stated_credits": None, "stated_debits": None,
}

# Chase Checking summary debit categories (printed negative); summed (abs) into
# stated_debits. Best-effort — a missing label just contributes 0.
_CHASE_DEBIT_LABELS = (
    "Checks Paid",
    "ATM & Debit Card Withdrawals",
    "Electronic Withdrawals",
    "Other Withdrawals",
    "Fees",
)

# A money figure as printed in statement summaries. Handles every sign/symbol
# ordering Chase uses: `342.19`, `$342.19`, `-146.88`, and crucially `-$146.88`
# (minus BEFORE the dollar — the 2025 layout). _money_or_none strips $ and ,.
_MONEY = r"(-?\$?-?[\d,]+\.\d{2})"


def _period_dates(stmt_str: str):
    """Parse 'MM/DD/YYYY - MM/DD/YYYY' into (start_iso, end_iso)."""
    m = re.match(r"\s*(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})\s*$", stmt_str or "")
    if not m:
        return None, None

    def iso(s):
        mm, dd, yy = s.split("/")
        return f"{yy}-{mm}-{dd}"

    return iso(m.group(1)), iso(m.group(2))


def _money_or_none(s):
    if s is None:
        return None
    return round(float(s.replace(",", "").replace("$", "")), 2)


def _chase_mortgage_summary(text: str) -> dict:
    """Recognized Chase mortgage statement: capture the statement date + unpaid
    principal balance (the authoritative loan balance). `_stmt` is the human
    period string, popped by parse_one. No transactions are ledgered yet."""
    s = dict(_EMPTY_SUMMARY)
    m = re.search(r"Statement date\s+(\d{2})/(\d{2})/(\d{4})", text)
    if m:
        mm, dd, yyyy = m.groups()
        s["period_end"] = f"{yyyy}-{mm}-{dd}"
        s["_stmt"] = f"{mm}/{dd}/{yyyy}"
    else:
        s["_stmt"] = ""
    mb = re.search(r"Unpaid principal balance\s*\$?\s*([\d,]+\.\d{2})", text)
    if mb:
        s["ending_balance"] = round(float(mb.group(1).replace(",", "")), 2)
    return s


def extract_statement_summary(text: str, issuer: str, stmt_str: str) -> dict:
    summary = dict(_EMPTY_SUMMARY)
    summary["period_start"], summary["period_end"] = _period_dates(stmt_str)

    # Bank statements print Beginning/Ending Balance lines (Chase checking,
    # Gain FCU). Optional leading '$'; allow negative.
    if issuer in ("chase_checking", "gain_fcu"):
        m_beg = re.search(r"Beginning Balance\s+" + _MONEY, text)
        m_end = re.search(r"Ending Balance\s+" + _MONEY, text)
        if m_beg:
            summary["beginning_balance"] = _money_or_none(m_beg.group(1))
        if m_end:
            summary["ending_balance"] = _money_or_none(m_end.group(1))

    # Chase Checking SUMMARY block prints stated deposit + withdrawal totals.
    if issuer == "chase_checking":
        m_dep = re.search(r"Deposits and Additions\s+" + _MONEY, text)
        if m_dep:
            summary["stated_credits"] = abs(_money_or_none(m_dep.group(1)))
        debit_total, found = 0.0, False
        for lbl in _CHASE_DEBIT_LABELS:
            m = re.search(re.escape(lbl) + r"\s+" + _MONEY, text)
            if m:
                debit_total += abs(_money_or_none(m.group(1)))
                found = True
        if found:
            summary["stated_debits"] = round(debit_total, 2)

    return summary


def parse_one(text_path: str, original_pdf_filename: str = None,
              pdf_path: str = None) -> tuple[list[dict], str, str, dict]:
    """
    Parse one statement and return (transactions, statement_period_string, issuer,
    summary). `summary` holds the statement-stated audit control totals (see
    extract_statement_summary); all-null for deferred issuers.

    text_path: path to the pdftotext-layout output of the statement
    original_pdf_filename: the original PDF filename (used for the Account label
        and Source file column). If None, falls back to the text file's name.
    pdf_path: optional path to the source PDF. When provided, Apple Card
        statements parse via pdfplumber (position-aware) instead of the
        line-based fallback — needed for statements with RETURN-with-Daily-
        Cash-Adjustment rows that the line parser can't disambiguate.

    Each returned transaction dict will have account and source_file populated.
    """
    # UTF-8 with replacement — pdftotext emits UTF-8 (see extract.py); never let
    # a stray byte crash the read (Windows would otherwise default to cp1252).
    text = Path(text_path).read_text(encoding="utf-8", errors="replace")
    issuer = detect_issuer(text)
    # Investment issuers carry holdings, not bank transactions — extract.py calls
    # parse_holdings() separately. Return no transactions here (don't hit PARSERS).
    if issuer in INVESTMENT_ISSUERS or issuer == "unknown":
        return [], "", issuer, dict(_EMPTY_SUMMARY)
    # Loan statements (mortgage/auto): recognized + the key figures captured, but
    # NOT auto-ledgered yet — naive payment rows would double-count the
    # checking-side mortgage split and skew the loan balance (no opening balance).
    # See references/bank_formats.md (loan-ledger model is an open decision).
    if issuer == "chase_mortgage":
        s = _chase_mortgage_summary(text)
        return [], s.pop("_stmt", ""), "chase_mortgage", s
    if issuer == "chase_auto":
        return [], "", "chase_auto", dict(_EMPTY_SUMMARY)
    # Ally (combined multi-account) + Schwab print debits in a separate column
    # without an inline minus, so the signed amount must come from the running
    # balance delta (not yet implemented) — recognize but don't ledger, to avoid
    # booking withdrawals as deposits. Deposits-only parsing would be half-wrong.
    if issuer in ("ally", "schwab_checking"):
        return [], "", issuer, dict(_EMPTY_SUMMARY)

    if issuer == "apple_card" and pdf_path:
        txns, stmt_str = parse_apple_card_pdfplumber(pdf_path)
    else:
        parser = PARSERS[issuer]
        txns, stmt_str = parser(text)

    # Derive account label + number, and inject source_file
    pdf_name = original_pdf_filename or Path(text_path).name
    account, account_number = derive_account_info(pdf_name, issuer, text)
    for t in txns:
        t["account"] = account
        t["account_number"] = account_number
        t["source_file"] = pdf_name

    summary = extract_statement_summary(text, issuer, stmt_str)
    return txns, stmt_str, issuer, summary


# ---------- Investment holdings ----------
# Investment/brokerage statements carry positions (the `holdings` table), not
# bank transactions. extract.py routes these issuers to parse_holdings().
INVESTMENT_ISSUERS = {"jpm_investment", "fidelity", "empower", "optum_hsa"}

_HOLD_NUM_RE = re.compile(r"^-?\$?[\d,]+(?:\.\d+)?%?$")


def _to_num(tok: str):
    """Money/number token → float, or None for blanks/dashes/non-numbers."""
    t = tok.replace("$", "").replace(",", "").replace("%", "").strip()
    if t in ("", "-", "--", "N/A"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def _tsv_lines(tsv_text: str):
    """Parse `pdftotext -tsv` into logical lines, grouped by poppler's own
    (page, block, line) detection — which reconstructs rows correctly even where
    `-layout` interleaves columns or the page has rotated banners. Returns
    [{page, top, words: [(left, text)], text}]."""
    lines = []
    cur_key = None
    cur = None
    for raw in tsv_text.splitlines()[1:]:  # skip the TSV header row
        parts = raw.split("\t")
        if len(parts) < 12:
            continue
        page, block, line, left, top, text = parts[1], parts[3], parts[4], parts[6], parts[7], parts[11]
        if not text or text.startswith("###"):
            continue
        try:
            left_f, top_f = float(left), float(top)
        except ValueError:
            continue
        key = (page, block, line)
        if key != cur_key:
            if cur:
                cur["text"] = " ".join(w for _, w in cur["words"])
                lines.append(cur)
            cur = {"page": int(page), "top": top_f, "words": []}
            cur_key = key
        cur["words"].append((left_f, text))
    if cur:
        cur["text"] = " ".join(w for _, w in cur["words"])
        lines.append(cur)
    return lines


def parse_holdings(text: str, issuer: str, tsv_text: str = "") -> list[dict]:
    """Dispatch to a per-issuer holdings extractor. Returns a list of position
    dicts: {symbol, name, asset_class, quantity, price, value, cost_basis,
    as_of}. Empty list if the issuer has no holdings parser or none are found."""
    if issuer == "fidelity":
        return _parse_fidelity_holdings(text, tsv_text)
    if issuer == "empower":
        return _parse_empower_holdings(text, tsv_text)
    return []


# Fidelity NFS statement — data-row column x-centers (the template is stable;
# values are right-aligned just left of the header word). Each numeric cell is
# bucketed to the nearest anchor within tolerance, so blank/"-" columns are
# handled and the Beginning-MV / Gain / EAI columns (other x's) are ignored.
_FID_COLS = {"quantity": 316.0, "price": 375.0, "value": 463.0, "cost": 542.0}
_FID_COL_TOL = 45.0
_FID_SECTIONS = [
    ("CORE ACCOUNT", "cash"), ("MONEY MARKET", "cash"), ("CASH", "cash"),
    ("STOCK FUNDS", "mutual_fund"), ("BOND FUNDS", "mutual_fund"),
    ("OTHER FUNDS", "mutual_fund"), ("MUTUAL FUNDS", "mutual_fund"),
    ("EXCHANGE TRADED", "etf"), ("ETPS", "etf"), ("ETFS", "etf"),
    ("STOCKS", "equity"), ("EQUITIES", "equity"),
    ("BONDS", "bond"), ("OPTIONS", "option"),
]


def _fid_col(words, anchor, tol=_FID_COL_TOL):
    """Numeric value whose x is nearest `anchor` within `tol`, else None."""
    best, best_d = None, tol
    for left, w in words:
        n = _to_num(w)
        if n is None:
            continue
        d = abs(left - anchor)
        if d < best_d:
            best, best_d = n, d
    return best


def _fid_period_end(text: str):
    """ISO period-end date from 'August 1, 2021 - September 30, 2021'."""
    m = re.search(r"([A-Za-z]+ \d{1,2}, \d{4})\s*[-–]\s*([A-Za-z]+ \d{1,2}, \d{4})", text)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(2), "%B %d, %Y").date().isoformat()
    except ValueError:
        return None


def _parse_fidelity_holdings(text: str, tsv_text: str) -> list[dict]:
    if not tsv_text:
        return []  # robust holdings extraction needs coordinate (-tsv) data
    as_of = _fid_period_end(text)
    lines = _tsv_lines(tsv_text)
    out = []
    section = "other"
    seen = set()
    for ln in lines:
        t = ln["text"].strip()
        tu = t.upper()
        if "TOTAL HOLDINGS" in tu:
            break  # end of the Holdings section
        # Track the current asset-class section header (skip "Total ..." rollups).
        if "TOTAL" not in tu:
            for label, cls in _FID_SECTIONS:
                if tu.startswith(label):
                    section = cls
                    break
        # A position row carries a (TICKER) plus values sitting in the holdings
        # columns. Requiring the Ending-MV column AND a quantity/price column
        # filters out stray "(TICKER)" mentions elsewhere in the statement.
        m = re.search(r"\(([A-Z]{1,6})\)", t)
        if not m or tu.startswith("TOTAL"):
            continue
        words = ln["words"]
        value = _fid_col(words, _FID_COLS["value"])
        quantity = _fid_col(words, _FID_COLS["quantity"])
        price = _fid_col(words, _FID_COLS["price"])
        if value is None or (quantity is None and price is None):
            continue
        symbol = m.group(1)
        if symbol in seen:
            continue
        seen.add(symbol)
        name = re.sub(r"\s+", " ", t[: m.start()]).strip()
        out.append({
            "symbol": symbol,
            "name": name or symbol,
            "asset_class": section,
            "quantity": quantity,
            "price": price,
            "value": value,
            "cost_basis": _fid_col(words, _FID_COLS["cost"]),
            "as_of": as_of,
        })
    return out


# Empower fund-name keyword → asset class (no ticker/cost basis in this format).
_EMP_CLASS = [
    ("STABLE VALUE", "cash"), ("MONEY MARKET", "cash"),
    ("BOND", "bond"), ("FIXED INCOME", "bond"), ("TREASURY", "bond"),
]
_EMP_SKIP_NAMES = ("TOTAL", "BEGINNING", "DESCRIPTION", "UNITS", "SHARES", "BALANCE",
                   "CONTRIBUTION", "DEPOSITS", "DIVIDENDS", "VESTED", "ENDING")
# Lowercase function words that mark a line as disclosure prose, not a fund name.
_EMP_PROSE = {"the", "and", "you", "your", "of", "to", "for", "we", "that", "is",
              "are", "be", "by", "on", "as", "or", "this", "will", "may", "a", "an",
              "in", "with", "from", "have", "any", "if", "must", "not"}


def _emp_as_of(text: str):
    m = re.search(r"[Aa]s of ([A-Z][a-z]+ \d{1,2}, \d{4})", text)
    if m:
        try:
            return datetime.strptime(m.group(1), "%B %d, %Y").date().isoformat()
        except ValueError:
            pass
    return None


def _emp_is_fund_name(s: str) -> bool:
    words = s.split()
    if not (1 <= len(words) <= 6) or s.rstrip().endswith("."):
        return False
    if not re.match(r"^[A-Za-z]", s) or not re.search(r"[A-Z]", s):
        return False
    up = s.upper()
    if any(up.startswith(k) for k in _EMP_SKIP_NAMES):
        return False
    if any(w in _EMP_PROSE for w in s.lower().split()):
        return False
    return True


def _parse_empower_holdings(text: str, tsv_text: str = "") -> list[dict]:
    """Empower 401k 'How is my account invested?' holdings, from -tsv coordinate
    data (the -layout text interleaves full-width disclosure prose with the table
    at the same rows). Cluster logical lines by row (y); a fund row has a clean
    short name line plus its values as separate cells — the two rightmost numerics
    by x are Ending Balance (market value) and Units/Shares. No ticker/cost basis."""
    if not tsv_text:
        return []
    lines = _tsv_lines(tsv_text)
    # Bound to the invested section: between its title and the next ("funded" /
    # "performed") section on the same page.
    inv_page = inv_top = end_top = None
    for ln in lines:
        low = ln["text"].lower()
        if inv_page is None and "how is my account invested" in low:
            inv_page, inv_top = ln["page"], ln["top"]
        elif inv_page is not None and ln["page"] == inv_page and ln["top"] > inv_top and (
            "being funded" in low or "investments performed" in low
        ):
            end_top = ln["top"]
            break
    if inv_page is None:
        return []
    hi = end_top if end_top is not None else 1e9

    rows = [ln for ln in lines if ln["page"] == inv_page and inv_top - 1 < ln["top"] < hi]
    # Cluster lines into visual rows by y.
    rows.sort(key=lambda l: l["top"])
    clusters = []
    for ln in rows:
        if clusters and abs(ln["top"] - clusters[-1][0]) <= 4:
            clusters[-1][1].append(ln)
        else:
            clusters.append((ln["top"], [ln]))

    as_of = _emp_as_of(text)
    num_re = re.compile(r"^-?[\d,]+\.\d+$")
    out, seen = [], set()
    for _top, group in clusters:
        numerics = []  # (x, value)
        name = None
        for ln in group:
            for x, w in ln["words"]:
                if num_re.match(w):
                    numerics.append((x, float(w.replace(",", ""))))
            if name is None and _emp_is_fund_name(ln["text"].strip()):
                name = ln["text"].strip()
        if not name or len(numerics) < 2 or name in seen:
            continue
        numerics.sort(key=lambda t: t[0])
        ending = numerics[-2][1]
        units = numerics[-1][1]
        if ending <= 0:
            continue
        seen.add(name)
        cls = "mutual_fund"
        nu = name.upper()
        for kw, c in _EMP_CLASS:
            if kw in nu:
                cls = c
                break
        out.append({
            "symbol": None,
            "name": name,
            "asset_class": cls,
            "quantity": units if units > 0 else None,
            "price": round(ending / units, 4) if units else None,
            "value": ending,
            "cost_basis": None,
            "as_of": as_of,
        })
    return out


# ---------- Paystubs ----------
def detect_paystub(text: str) -> bool:
    """CBIZ-style paystub: has Pay Date + Gross/Net Pay + Pay Period/Voucher."""
    return (
        "Pay Date" in text
        and "Net Pay" in text
        and "Gross Pay" in text
        and ("Pay Period" in text or "Voucher" in text)
    )


# Imputed (non-cash) earnings the IRS counts as income but that don't hit net
# pay — listed among earnings, reported separately as a fringe benefit.
_IMPUTED_LABELS = {"GTLI", "LTD"}
_MONEY_RE = re.compile(r"^-?[\d,]+\.\d{2}$")
# Header/section words that should never be treated as a line-item label.
_HDR_WORDS = {"CURRENT", "YTD", "TAXABLE", "RATE", "HOURS", "PAID"}


def _money(s):
    return round(float(s.replace(",", "")), 2)


def _reconciles(items, total, tol=0.02):
    if total is None or not items:
        return False
    return abs(round(sum(i["amount"] for i in items), 2) - total) <= tol


def _paystub_header(text: str) -> dict:
    """Header fields, parsed from a flat (newline-joined) rendering of the stub."""
    def find(pat, g=1):
        m = re.search(pat, text)
        return m.group(g) if m else None

    pdr = find(r"Pay Date:\s*(\d{2}/\d{2}/\d{4})")
    pay_date = None
    if pdr:
        mm, dd, yy = pdr.split("/")
        pay_date = f"{yy}-{mm}-{dd}"
    period = find(r"Pay Period:\s*(\d{2}/\d{2}/\d{4}\s*-\s*\d{2}/\d{2}/\d{4})")
    base = find(r"Base Comp:\s*\$([\d,]+\.\d{2})")
    employer = find(r"([A-Z][A-Z&'.\- ]+(?:LLC|INC|CORP|GROUP|COMPANY))")
    hours = find(r"Hours Paid\s+([\d.]+)")
    return {
        "pay_date": pay_date,
        "pay_period": period.replace(" ", "") if period else None,
        "voucher": find(r"Voucher\s*#?\(?(\d+)\)?"),
        "base_comp": _money(base) if base else None,
        "employer": employer.strip() if employer else None,
        "hours": float(hours) if hours else None,
    }


def _tax_settings(text: str) -> dict:
    """Parse the 'Tax Allowance Settings' block (the employee's W-4 elections).
    Works on a flat (newline-joined) rendering. Returns None values when absent."""
    t = text.replace("Additional Allowances", "Additional_Allowances")

    def f(pat, g=1):
        m = re.search(pat, t)
        return m.group(g) if m else None

    def num(pat):
        v = f(pat)
        return _money(v) if v else None

    def intg(pat):
        v = f(pat)
        return int(v) if v else None

    fed = re.search(r"Federal:\s*([A-Za-z/][A-Za-z/ .]+?)(?:\s{2,}|California:|Form|$)", t)
    return {
        "filing_status": f(r"Filing Status:\s*([A-Za-z]+)"),
        "federal": fed.group(1).strip() if fed else None,
        "claim_dependent": num(r"Claim Dependent:\s*\$?([\d,]+\.\d{2})"),
        "deduction": num(r"\bDeduction:\s*\$?([\d,]+\.\d{2})"),
        "other_income": num(r"Other Income:\s*\$?([\d,]+\.\d{2})"),
        "allowances": intg(r"\bAllowances:\s*(\d+)"),
        "additional_allowances": intg(r"Additional_Allowances:\s*(\d+)"),
        "two_jobs": f(r"Two Jobs:\s*(Yes|No)"),
        "supplemental_type": f(r"Supplemental Type:\s*([A-Za-z]+)"),
    }


def _parse_paystub_tsv(tsv_text: str) -> dict:
    """Coordinate-based paystub parse from `pdftotext -tsv` output.

    The stub is a dense two-column (Current / YTD) form whose blocks REFLOW with
    content, so flat-text anchors are unreliable. Here we cluster words into
    visual rows by their y-coordinate, locate the Current/YTD column x-positions,
    and read each labelled row's value from the correct column. Sections are
    anchored to their own header + Total rows. Line items are emitted only when
    they reconcile to the section total, so a breakdown can be trusted to add up.
    """
    def hasl(t):
        return bool(re.search(r"[A-Za-z]", t))

    # Words → visual rows (page 1, the stub face).
    ws = []
    for ln in tsv_text.splitlines():
        p = ln.split("\t")
        if len(p) < 12 or p[0] != "5":
            continue
        try:
            if int(p[1]) != 1:
                continue
            left, top, txt = float(p[6]), float(p[7]), p[11]
        except (ValueError, IndexError):
            continue
        if not txt or txt.startswith("#"):
            continue
        ws.append((top, left, txt))
    ws.sort()
    rows = []
    cur, cy = [], None
    for top, left, txt in ws:
        if cy is not None and abs(top - cy) > 3.5:
            rows.append((cy, sorted(cur)))
            cur, cy = [], None
        if cy is None:
            cy = top
        cur.append((left, txt))
    if cur:
        rows.append((cy, sorted(cur)))

    # Current/YTD column x-positions: left block (x<300) and employer block (x>=300).
    lc = ec = None
    for _, tk in rows:
        for l, t in tk:
            if t == "Current":
                if l < 300 and lc is None:
                    lc = l
                elif l >= 300 and ec is None:
                    ec = l
    ly = ey = None
    for _, tk in rows:
        for l, t in tk:
            if t == "YTD":
                if lc and l > lc and (ly is None or l < ly):
                    ly = l
                if ec and l > ec and (ey is None or l < ey):
                    ey = l
    lc, ly, ec, ey = lc or 204, ly or 266, ec or 474, ey or 536
    lcur = (lc - 15, (lc + ly) / 2)  # left-block "Current" value window
    ecur = (ec - 15, (ec + ey) / 2)  # employer-block "Current" value window

    def mon(tk, win):
        for l, t in tk:
            if win[0] <= l <= win[1] and _MONEY_RE.match(t):
                return _money(t)
        return None

    def mon_any(tk):  # value in either Current column (a row may sit in either block)
        for win in (lcur, ecur):
            v = mon(tk, win)
            if v is not None:
                return v
        return None

    def has(tk, word, xmax=120, xmin=0):
        return any(xmin <= l < xmax and t == word for l, t in tk)

    def find_y(pred):
        for y, tk in rows:
            if pred(tk):
                return y
        return None

    earn_y = find_y(lambda tk: has(tk, "Earnings"))
    ded_y = find_y(lambda tk: has(tk, "Deductions"))
    tax_y = find_y(lambda tk: has(tk, "Taxes"))
    cpb_y = find_y(lambda tk: has(tk, "Company", 400))  # "Company Paid Benefits"

    # Each section's Total row anchors its lower bound (the layout reflows, so we
    # can't assume a fixed order or the position of "Net Pay").
    left_totals = [(y, mon(tk, lcur)) for y, tk in rows if has(tk, "Total")]
    right_totals = [(y, mon(tk, ecur)) for y, tk in rows if any(l >= 300 and t == "Total" for l, t in tk)]

    def first_after(lst, y0):
        for y, v in lst:
            if y0 is not None and y > y0:
                return y, v
        return None, None

    ded_tot_y, deductions_total = first_after(left_totals, ded_y)
    tax_tot_y, taxes_total = first_after(left_totals, tax_y)
    emp_tot_y, employer_total = first_after(right_totals, cpb_y)

    def section_lines(y0, y1, x0, x1, win, skip=()):
        out = []
        for y, tk in rows:
            if y0 is None or y1 is None or not (y0 < y < y1):
                continue
            label = " ".join(t for l, t in tk if x0 <= l < x1 and hasl(t)).strip()
            if not label or label == "Total" or label in skip:
                continue
            if set(label.upper().split()) <= _HDR_WORDS:
                continue
            v = mon(tk, win)
            out.append({"label": label, "amount": v if v is not None else 0.0})
        return out

    earn_lines = section_lines(earn_y, ded_y, 40, 120, lcur, skip=("Gross Pay", "Hours Paid"))
    ded_lines = section_lines(ded_y, ded_tot_y, 40, 120, lcur)
    tax_lines = section_lines(tax_y, tax_tot_y, 40, 120, lcur)
    emp_lines = section_lines(cpb_y, emp_tot_y, 315, 400, ecur)

    gross_row = next((tk for y, tk in rows if has(tk, "Gross")), None)
    net_row = next((tk for y, tk in rows if any(t == "Net" for l, t in tk) and any(t == "Pay" for l, t in tk)), None)
    gross = mon_any(gross_row) if gross_row else None
    net = mon_any(net_row) if net_row else None

    imputed = [i for i in earn_lines if i["label"].upper() in _IMPUTED_LABELS]
    earnings = [i for i in earn_lines if i["label"].upper() not in _IMPUTED_LABELS and i["amount"]]
    fringe_row = next((tk for y, tk in rows if has(tk, "Non", 400) and any(t == "Fringe" for l, t in tk)), None)
    non_cash_fringe = mon_any(fringe_row) if fringe_row else (
        round(sum(i["amount"] for i in imputed), 2) if imputed else None
    )

    # Deposits: an inline "<Bank> (1234) <amount>" row (4-digit acct in parens).
    deposits = []
    for _, tk in rows:
        paren = next(((l, t) for l, t in tk if re.match(r"^\(\d{4}\)$", t)), None)
        if not paren:
            continue
        bank = " ".join(t for l, t in tk if l < paren[0] and hasl(t)).strip()
        amt = mon_any(tk)
        if bank and amt:
            deposits.append({"bank": bank, "last4": paren[1][1:5], "amount": amt})

    flat = "\n".join(" ".join(t for _, t in tk) for _, tk in rows)
    return {
        **_paystub_header(flat),
        "gross": gross,
        "net": net,
        "employer_total": employer_total,
        "deductions_total": deductions_total,
        "taxes_total": taxes_total,
        "non_cash_fringe": non_cash_fringe,
        "deposits": deposits,
        "earnings": earnings,
        "deductions": ded_lines if _reconciles(ded_lines, deductions_total) else [],
        "taxes": tax_lines if _reconciles(tax_lines, taxes_total) else [],
        "employer_contributions": emp_lines if _reconciles(emp_lines, employer_total) else [],
        "imputed": imputed,
        "tax_settings": _tax_settings(flat),
    }


def _parse_paystub_text(text: str) -> dict:
    """Degraded fallback when no -tsv-capable pdftotext is available: header +
    section totals from the -layout text, no per-line breakdowns."""
    def find(pat, g=1):
        m = re.search(pat, text)
        return m.group(g) if m else None

    gross = find(r"Gross Pay\s+([\d,]+\.\d{2})")
    net = find(r"Net Pay\s+([\d,]+\.\d{2})")
    fringe = find(r"Non[- ]Cash Fringe Benefit\s+([\d,]+\.\d{2})")
    totals = re.findall(r"Total\s+([\d,]+\.\d{2})", text)
    employer_total = _money(totals[0]) if totals else None
    deductions_total = None
    if "Deductions" in text and "Taxes Withheld" in text:
        region = text.split("Taxes Withheld")[0].rsplit("Deductions", 1)[-1]
        pairs = re.findall(r"([\d,]+\.\d{2})\s+\1", region)
        if pairs:
            deductions_total = _money(pairs[-1])
    mt = re.search(r"Total\s+([\d,]+\.\d{2})\s+[\d,]+\.\d{2}\s+Net Pay", text)
    return {
        **_paystub_header(text),
        "gross": _money(gross) if gross else None,
        "net": _money(net) if net else None,
        "employer_total": employer_total,
        "deductions_total": deductions_total,
        "taxes_total": _money(mt.group(1)) if mt else None,
        "non_cash_fringe": _money(fringe) if fringe else None,
        "deposits": [],
        "earnings": [], "deductions": [], "taxes": [], "employer_contributions": [], "imputed": [],
        "tax_settings": _tax_settings(text),
    }


def parse_paystub(text: str, tsv_text: str = "") -> dict:
    """Parse a paystub. Prefers the coordinate-based path (`tsv_text` from
    `pdftotext -tsv`); falls back to the -layout text when TSV is unavailable."""
    if tsv_text and "level\tpage_num" in tsv_text[:200]:
        return _parse_paystub_tsv(tsv_text)
    return _parse_paystub_text(text)


# ---------- Main ----------
if __name__ == "__main__":
    # Demo: parse all .txt files in /tmp and print summary.
    # In real use, the run script will call parse_one() per file
    # and feed results into build_master.build_or_append().
    import sys
    if len(sys.argv) < 2:
        print("Usage: python parse_statements.py <path-to-pdftotext-output.txt> [...]")
        sys.exit(1)
    for path in sys.argv[1:]:
        try:
            txns, stmt, issuer = parse_one(path)
            print(f"{Path(path).name}: {len(txns)} txns, issuer={issuer}, period={stmt}")
        except Exception as e:
            print(f"{Path(path).name}: ERROR — {e}")
