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
from parse_statements import parse_one, detect_paystub, parse_paystub  # noqa: E402


def _tsv_text(pdf_path):
    """Return `pdftotext -tsv` output (per-word coordinates) for the paystub
    coordinate parser. The PATH pdftotext may be Xpdf (no -tsv), so try a
    poppler binary: PDFTOTEXT_BIN override, then PATH, then common install
    locations. Returns "" if none can emit TSV (parser falls back to text)."""
    candidates = []
    for env in ("PDFTOTEXT_TSV_BIN", "PDFTOTEXT_BIN", "POPPLER_PDFTOTEXT"):
        if os.environ.get(env):
            candidates.append(os.environ[env])
    candidates.append("pdftotext")  # PATH — poppler if installed
    candidates += glob.glob(os.path.expanduser(
        "~/AppData/Local/Microsoft/WinGet/Packages/*Poppler*/poppler-*/Library/bin/pdftotext.exe"))
    candidates += [
        r"C:\Program Files\poppler\Library\bin\pdftotext.exe",
        "/usr/bin/pdftotext", "/usr/local/bin/pdftotext", "/opt/homebrew/bin/pdftotext",
    ]
    for c in candidates:
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
    "jpm_investment": "investment",
    "unknown": "unknown",
}


def _iso(d):
    if isinstance(d, (date, datetime)):
        return d.isoformat()[:10]
    return d


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
        txns, stmt_str, issuer = parse_one(
            tmp_txt, original_pdf_filename=original_name, pdf_path=pdf_path
        )
        deferred = issuer in ("jpm_investment", "unknown")
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
            "transactions": [
                {
                    "date": _iso(t.get("date")),
                    "source": t.get("source", ""),
                    "amount": t.get("amount"),
                    "balance": t.get("balance"),
                }
                for t in txns
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
