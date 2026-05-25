#!/usr/bin/env python3
"""
JSON adapter between the parser and Vault's upload pipeline.

Usage:
    python parser/extract.py <path-to-statement.pdf> [original-filename]

Runs `pdftotext -layout` on the PDF, dispatches through parse_one(), and prints
ONE JSON object to stdout. The original filename matters — the account label and
last-4 are derived from it (see SKILL.md "Deriving the Account label").

Success:
    {
      "ok": true,
      "issuer": "chase_card",
      "type": "credit_card",          # coarse router type (see ISSUER_TYPE)
      "deferred": false,              # true for investment / unknown
      "account": "Chase Prime 5678",
      "accountNumber": "5678",
      "statementPeriod": "02/05/2021 - 03/04/2021",
      "summary": {                      # statement-stated audit control totals
        "period_start": "2021-02-05", "period_end": "2021-03-04",
        "beginning_balance": null, "ending_balance": null,
        "stated_credits": null, "stated_debits": null
      },
      "transactions": [
        {"date": "2021-02-10", "source": "AMAZON ...", "amount": -42.10, "balance": null}
      ]
    }

Failure:
    {"ok": false, "error": "..."}   (exit code 1)
"""

import glob
import json
import os
import subprocess
import sys
import tempfile
import traceback
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_statements import (  # noqa: E402
    parse_one, detect_issuer, detect_paystub, parse_paystub,
    parse_holdings, derive_account_label, INVESTMENT_ISSUERS,
)

# Multi-column statements that Xpdf -layout mangles (drops/misaligns rows) but
# poppler -layout reconstructs cleanly. The existing parsers (chase/apple/
# discover/gain) are tuned to Xpdf and stay on it; only these re-extract via
# poppler for parsing.
POPPLER_LAYOUT_ISSUERS = {"amex_checking", "amex_hysa", "citi_card", "boa_card", "capital_one",
                          "apple_savings", "boa_checking", "schwab_checking", "ally", "optum_hsa",
                          "chase_mortgage"}


def _poppler_candidates():
    """Candidate pdftotext binaries, poppler-preferred. The bundled PATH one may
    be Xpdf (no -tsv, and it mangles multi-column layouts); poppler is found via
    env override or common install locations."""
    candidates = []
    for env in ("PDFTOTEXT_TSV_BIN", "PDFTOTEXT_BIN", "POPPLER_PDFTOTEXT"):
        if os.environ.get(env):
            candidates.append(os.environ[env])
    candidates += glob.glob(os.path.expanduser(
        "~/AppData/Local/Microsoft/WinGet/Packages/*Poppler*/poppler-*/Library/bin/pdftotext.exe"))
    candidates += [
        r"C:\Program Files\poppler\Library\bin\pdftotext.exe",
        "/usr/bin/pdftotext", "/usr/local/bin/pdftotext", "/opt/homebrew/bin/pdftotext",
    ]
    candidates.append("pdftotext")  # PATH last (often Xpdf)
    return candidates


def _poppler_layout(pdf_path):
    """`pdftotext -layout` from a *poppler* binary (not the bundled Xpdf). Poppler
    reconstructs multi-column statements (Amex/Citi/BOA/Capital One) cleanly where
    Xpdf drops or misaligns rows. Returns the text, or "" if no poppler is found —
    callers fall back to the Xpdf layout. Identifies poppler by -tsv support
    (Xpdf lacks it)."""
    for c in _poppler_candidates():
        try:
            probe = subprocess.run([c, "-tsv", pdf_path, "-"], capture_output=True, text=True, encoding="utf-8")
            if probe.returncode != 0 or not probe.stdout.startswith("level\tpage_num"):
                continue  # not poppler (or failed)
            r = subprocess.run([c, "-enc", "UTF-8", "-layout", pdf_path, "-"], capture_output=True, text=True, encoding="utf-8")
            if r.returncode == 0 and r.stdout:
                return r.stdout
        except (OSError, ValueError):
            continue
    return ""


def _tsv_text(pdf_path):
    """Return `pdftotext -tsv` output (per-word coordinates) for coordinate
    parsers (paystubs, holdings). Empty string if no poppler binary is found."""
    for c in _poppler_candidates():
        try:
            r = subprocess.run([c, "-tsv", pdf_path, "-"], capture_output=True, text=True, encoding="utf-8")
        except (OSError, ValueError):
            continue
        if r.returncode == 0 and r.stdout.startswith("level\tpage_num"):
            return r.stdout
    return ""

# Coarse type the router reports for each issuer. The DB account *type* is
# inferred separately during ingest; this is just metadata for the Files page.
ISSUER_TYPE = {
    "apple_card": "credit_card",
    "chase_card": "credit_card",
    "discover": "credit_card",
    "chase_checking": "bank",
    "gain_fcu": "bank",
    "amex_checking": "bank",
    "amex_hysa": "bank",
    "capital_one": "bank",
    "apple_savings": "bank",
    "boa_checking": "bank",
    "schwab_checking": "bank",
    "ally": "bank",
    "citi_card": "credit_card",
    "boa_card": "credit_card",
    "jpm_investment": "investment",
    "fidelity": "investment",
    "empower": "investment",
    "optum_hsa": "bank",
    "wealthfront": "bank",
    "chase_mortgage": "loan",
    "chase_auto": "loan",
    "unknown": "unknown",
}

# Recognized but not auto-ledgered: loans (money movement captured on the
# checking side; balance-model decision pending) + Wealthfront's Green Dot
# statement (structurally empty — swept to a separate Wealthfront Cash Account).
DEFERRED_ISSUERS = {"chase_mortgage", "chase_auto", "wealthfront"}


def _iso(d):
    if isinstance(d, (date, datetime)):
        return d.isoformat()[:10]
    return d


def _last4_from_name(name):
    """Last-4 account number from an investment filename, e.g.
    'Fidelity Roth IRA #6856 (...)' -> '6856'. None if absent."""
    import re as _re
    m = _re.search(r"#\s*(\d{3,6})", name or "")
    return m.group(1) if m else None


def _investment_account_label(name):
    """Human account label from an investment statement filename, e.g.
    'Empower 401k (0101 2026 thru 0331 2026).pdf' -> 'Empower 401k';
    'Fidelity Roth IRA #6856 (...).pdf' -> 'Fidelity Roth IRA #6856'."""
    import re as _re
    stem = Path(name).stem
    stem = _re.sub(r"^\d{8,}_", "", stem)          # upload-system id prefix
    stem = _re.sub(r"\s*\([^)]*\)\s*$", "", stem)  # trailing (date range)
    return stem.strip() or None


def _fail(msg, code=1):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(code)


def main():
    if len(sys.argv) < 2:
        _fail("usage: extract.py <pdf> [original-filename]", 2)
    pdf_path = sys.argv[1]
    original_name = sys.argv[2] if len(sys.argv) > 2 else Path(pdf_path).name
    if not os.path.isfile(pdf_path):
        _fail(f"file not found: {pdf_path}", 2)

    tmp_txt = None
    try:
        fd, tmp_txt = tempfile.mkstemp(suffix=".txt")
        os.close(fd)
        # `pdftotext -layout`, forcing UTF-8 output so non-ASCII glyphs (smart
        # quotes, bullets, etc. on Apple Card / Amex statements) round-trip
        # instead of crashing the downstream read on Windows' cp1252 default.
        subprocess.run(
            ["pdftotext", "-enc", "UTF-8", "-layout", pdf_path, tmp_txt],
            check=True,
            capture_output=True,
        )
        text = Path(tmp_txt).read_text(encoding="utf-8", errors="replace")
        if detect_paystub(text):
            # Paystubs are a dense two-column form whose blocks reflow with
            # content; coordinate-based parsing (pdftotext -tsv) is far more
            # reliable than flat text. Pass both — parse_paystub uses TSV when
            # available and falls back to the -layout text otherwise.
            ps = parse_paystub(text, _tsv_text(pdf_path))
            print(json.dumps({
                "ok": True,
                "issuer": "paystub",
                "type": "paystub",
                "deferred": False,
                "account": ps.get("employer"),
                "accountNumber": None,
                "statementPeriod": ps.get("pay_period"),
                "paystub": ps,
                "transactions": [],
            }))
            return

        # Multi-column issuers (Amex/Citi/BOA/Capital One) parse cleanly only
        # from poppler -layout; Xpdf drops/misaligns their rows. Detect on the
        # Xpdf text (keywords survive any layout), then re-extract via poppler
        # for those issuers so parse_one sees clean rows. Existing issuers stay
        # on Xpdf (their parsers are tuned to it).
        if detect_issuer(text) in POPPLER_LAYOUT_ISSUERS:
            pl = _poppler_layout(pdf_path)
            if pl:
                Path(tmp_txt).write_text(pl, encoding="utf-8")
                text = pl

        txns, stmt_str, issuer, summary = parse_one(
            tmp_txt, original_pdf_filename=original_name, pdf_path=pdf_path
        )

        # Investment issuers carry holdings (positions), not bank transactions.
        # Extract them with coordinate (-tsv) data; derive the account from the
        # filename since there are no transaction rows to carry it.
        holdings = []
        if issuer in INVESTMENT_ISSUERS:
            holdings = parse_holdings(text, issuer, _tsv_text(pdf_path))
            account = _investment_account_label(original_name) or derive_account_label(original_name, issuer, text)
            account_number = _last4_from_name(original_name)
            stmt_str = stmt_str or (holdings[0].get("as_of") if holdings else None)
            # Still deferred only if we recognized it but couldn't extract holdings.
            deferred = len(holdings) == 0
        elif issuer in DEFERRED_ISSUERS:
            # Recognized loan statement: claim it + derive a clean account label
            # from the filename, but don't ledger (avoids double-count + balance skew).
            deferred = True
            account = _investment_account_label(original_name) or derive_account_label(original_name, issuer, text)
            account_number = _last4_from_name(original_name)
        else:
            deferred = issuer == "unknown"
            account = txns[0].get("account") if txns else None
            account_number = txns[0].get("account_number") if txns else None

        out = {
            "ok": True,
            "issuer": issuer,
            "type": ISSUER_TYPE.get(issuer, "unknown"),
            "deferred": deferred,
            "account": account,
            "accountNumber": account_number or None,
            "statementPeriod": stmt_str or None,
            "summary": summary,
            "transactions": [
                {
                    "date": _iso(t.get("date")),
                    "source": t.get("source", ""),
                    "amount": t.get("amount"),
                    "balance": t.get("balance"),
                }
                for t in txns
            ],
            "holdings": [
                {
                    "symbol": h.get("symbol"),
                    "name": h.get("name"),
                    "assetClass": h.get("asset_class", "other"),
                    "quantity": h.get("quantity"),
                    "price": h.get("price"),
                    "value": h.get("value"),
                    "costBasis": h.get("cost_basis"),
                    "asOf": h.get("as_of"),
                }
                for h in holdings
            ],
        }
        print(json.dumps(out))
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or b"").decode("utf-8", "replace")[:500]
        _fail(f"pdftotext failed: {stderr}")
    except Exception as e:  # noqa: BLE001 — report any parse error as JSON
        _fail(f"{type(e).__name__}: {e} | {traceback.format_exc()[:600]}")
    finally:
        if tmp_txt and os.path.exists(tmp_txt):
            os.remove(tmp_txt)


if __name__ == "__main__":
    main()
