/**
 * Spawns the Python parser adapter (parser/extract.py) on an uploaded PDF and
 * returns the normalized result. This is the ONLY place the app touches Python
 * — the parser sits behind this interface so the implementation (local Python
 * today; a TS port or a parser service later) can be swapped without changing
 * the upload route or ingest.
 *
 * Override the interpreter with PYTHON_BIN (e.g. a venv python) for self-hosting.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type ExtractedTxn = {
  date: string; // YYYY-MM-DD
  source: string;
  amount: number;
  balance: number | null;
};

// Statement-stated audit control totals (captured from the PDF summary,
// independent of the parsed rows). Null fields = format doesn't print it / not
// extracted yet. See parser/parse_statements.py:extract_statement_summary.
export type ExtractedSummary = {
  period_start: string | null; // YYYY-MM-DD
  period_end: string | null;
  beginning_balance: number | null;
  ending_balance: number | null;
  stated_credits: number | null;
  stated_debits: number | null;
};

// One investment position from a brokerage/retirement statement → the holdings
// table. See parser/parse_statements.py:parse_holdings.
export type ExtractedHolding = {
  symbol: string | null;
  name: string;
  assetClass: string; // equity/etf/mutual_fund/bond/cash/crypto/option/other
  quantity: number | null;
  price: number | null;
  value: number | null; // statement-reported market value
  costBasis: number | null;
  asOf: string | null; // YYYY-MM-DD (statement period end)
};

export type ExtractedPaystubLine = { label: string; amount: number };

export type ExtractedPaystub = {
  pay_date: string | null;
  pay_period: string | null;
  voucher: string | null;
  base_comp: number | null;
  gross: number | null;
  net: number | null;
  hours: number | null;
  employer_total: number | null;
  deductions_total: number | null;
  taxes_total: number | null;
  non_cash_fringe: number | null;
  employer: string | null;
  deposits: { bank: string; last4: string; amount: number }[];
  earnings: ExtractedPaystubLine[];
  deductions: ExtractedPaystubLine[];
  taxes: ExtractedPaystubLine[];
  employer_contributions: ExtractedPaystubLine[];
  imputed: ExtractedPaystubLine[];
  tax_settings: {
    filing_status: string | null;
    federal: string | null;
    claim_dependent: number | null;
    deduction: number | null;
    other_income: number | null;
    allowances: number | null;
    additional_allowances: number | null;
    two_jobs: string | null;
    supplemental_type: string | null;
  } | null;
};

export type ExtractResult =
  | {
      ok: true;
      issuer: string;
      type: string; // 'credit_card' | 'bank' | 'investment' | 'paystub' | 'unknown'
      deferred: boolean;
      account: string | null;
      accountNumber: string | null;
      statementPeriod: string | null;
      summary?: ExtractedSummary; // present for parsed statements (not paystubs)
      transactions: ExtractedTxn[];
      holdings?: ExtractedHolding[]; // present for investment statements
      paystub?: ExtractedPaystub;
    }
  | { ok: false; error: string };

const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
const EXTRACT_SCRIPT = join(process.cwd(), 'parser', 'extract.py');
const TIMEOUT_MS = 60_000;

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`parser timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

export async function runExtractor(pdf: Buffer, originalName: string): Promise<ExtractResult> {
  const dir = await mkdtemp(join(tmpdir(), 'vault-stmt-'));
  const pdfPath = join(dir, 'statement.pdf');
  await writeFile(pdfPath, pdf);
  try {
    const { stdout, stderr, code } = await run(PYTHON_BIN, [EXTRACT_SCRIPT, pdfPath, originalName]);
    const text = stdout.trim();
    if (!text) {
      return {
        ok: false,
        error: `parser produced no output (exit ${code}). ${stderr.slice(0, 300)}`.trim(),
      };
    }
    // The shim prints exactly one JSON object; take the last non-empty line to
    // be resilient to any stray prints from imported modules.
    const lastLine = text.split(/\r?\n/).filter(Boolean).pop()!;
    try {
      return JSON.parse(lastLine) as ExtractResult;
    } catch {
      return { ok: false, error: `unparseable parser output: ${text.slice(0, 300)}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The most common failure on a fresh machine: Python not on PATH.
    return { ok: false, error: msg.includes('ENOENT') ? `Python not found ('${PYTHON_BIN}'). Set PYTHON_BIN.` : msg };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
