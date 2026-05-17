#!/usr/bin/env python3
"""
Wrap the existing Python statement parsers and emit JSON.
Used by scripts/compare-parsers.ts.
Usage:
    python scripts/parse-one.py <path-to-pdf> [--issuer apple_card]
If --issuer is omitted, falls back to the skill's auto-detection.
Produces JSON to stdout:
    {
      "transactions": [
        {"date": "2024-03-15", "amount": -6.45, "source": "...", "category": "...", "subcategory": "..."},
        ...
      ],
      "stmt_period": "03/01/2024 - 03/31/2024",
      "issuer": "apple_card"
    }
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path
# ── Adjust this path to point at your local skill installation ──
SKILL_SCRIPTS = Path(
    r"C:\Users\LuisC\OneDrive\Documents\01 - Finances\02 - Tracing"
    r"\Statement Extraction\.claude\skills\bank-statement-extractor\scripts"
)
sys.path.insert(0, str(SKILL_SCRIPTS))
# Import from the skill scripts. Function name matches parse_statements.py.
from parse_statements import parse_one  # type: ignore
def pdf_to_text(pdf_path: Path) -> str:
    """Run pdftotext -layout. Same as the parser pipeline uses."""
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    return result.stdout
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf_path", type=Path)
    ap.add_argument("--issuer", default=None,
                    help="Force specific issuer (apple_card, chase_card, etc). "
                         "If omitted, parse_one auto-detects.")
    args = ap.parse_args()
    if not args.pdf_path.exists():
        print(f"File not found: {args.pdf_path}", file=sys.stderr)
        return 1
    text = pdf_to_text(args.pdf_path)
    # The existing parse_one expects a path to a text file, not text directly.
    # Write to a temp file alongside the PDF, then clean up.
    tmp = args.pdf_path.with_suffix(".tmp.txt")
    tmp.write_text(text)
    try:
        txns, stmt_str, issuer = parse_one(
            str(tmp),
            original_pdf_filename=args.pdf_path.name,
        )
    finally:
        tmp.unlink(missing_ok=True)
    if issuer in ("unknown", "jpm_investment") and not txns:
        print(
            f"parse_one returned no transactions: detected issuer={issuer!r}. "
            "Skill has no line-based parser for this issuer.",
            file=sys.stderr,
        )
        return 2
    output = {
        "transactions": [
            {
                "date": t["date"].isoformat(),
                "amount": float(t["amount"]),
                "source": t["source"],
                "category": t["category"],
                "subcategory": t["subcategory"],
            }
            for t in txns
        ],
        "stmt_period": stmt_str,
        "issuer": issuer,
    }
    print(json.dumps(output, indent=2))
    return 0
if __name__ == "__main__":
    sys.exit(main())
