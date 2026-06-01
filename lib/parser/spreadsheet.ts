import * as XLSX from 'xlsx';

import type { ExtractResult, ExtractedTxn } from '@/lib/parser/extract';

const SPREADSHEET_EXTENSIONS = new Set(['.csv', '.tsv', '.xls', '.xlsx']);

type Row = Record<string, unknown>;

type HeaderKey =
  | 'date'
  | 'source'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'account'
  | 'accountNumber'
  | 'balance';

const HEADER_ALIASES: Record<HeaderKey, string[]> = {
  date: ['date', 'posteddate', 'postingdate', 'transactiondate', 'transdate'],
  source: ['source', 'description', 'merchant', 'payee', 'name', 'memo', 'details', 'transaction'],
  amount: ['amount', 'transactionamount', 'netamount'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'spent', 'charge'],
  credit: ['credit', 'deposit', 'deposits', 'received', 'income'],
  account: ['account', 'accountname'],
  accountNumber: ['accountnumber', 'accountno', 'accountnum', 'account#', 'acctnumber', 'acct#'],
  balance: ['balance', 'runningbalance'],
};

export function isPdfFile(fileName: string, mimeType?: string): boolean {
  return mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

export function isSpreadsheetFile(fileName: string, mimeType?: string): boolean {
  const lower = fileName.toLowerCase();
  const hasExtension = [...SPREADSHEET_EXTENSIONS].some((ext) => lower.endsWith(ext));
  return (
    hasExtension ||
    mimeType === 'text/csv' ||
    mimeType === 'text/tab-separated-values' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

export function isSupportedImportFile(fileName: string, mimeType?: string): boolean {
  return isPdfFile(fileName, mimeType) || isSpreadsheetFile(fileName, mimeType);
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9#]+/g, '');
}

function headerMap(row: Row): Map<string, string> {
  const available = new Map(Object.keys(row).map((header) => [normalizeHeader(header), header]));
  const map = new Map<string, string>();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const matched = aliases.map(normalizeHeader).map((alias) => available.get(alias)).find(Boolean);
    if (matched) map.set(key, matched);
  }
  return map;
}

function value(row: Row, map: Map<string, string>, key: HeaderKey): unknown {
  const header = map.get(key);
  return header ? row[header] : null;
}

function parseDate(input: unknown): string | null {
  if (input == null || input === '') return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) return input.toISOString().slice(0, 10);
  if (typeof input === 'number' && Number.isFinite(input)) {
    const ms = (input - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const raw = String(input).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const year = Number(m[3]!.length === 2 ? `20${m[3]}` : m[3]);
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseMoney(input: unknown): number | null {
  if (input == null || input === '') return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  let raw = String(input).trim();
  if (!raw || raw === '-') return null;
  const negative = raw.startsWith('(') && raw.endsWith(')');
  raw = raw.replace(/[,$()\s]/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

function normalizeAccountNumber(input: unknown): string | null {
  if (input == null || input === '') return null;
  if (typeof input === 'number') return String(input).padStart(4, '0');
  return String(input).trim() || null;
}

function parseAmount(row: Row, map: Map<string, string>): number | null {
  const direct = parseMoney(value(row, map, 'amount'));
  if (direct != null) return direct;
  const debit = parseMoney(value(row, map, 'debit'));
  const credit = parseMoney(value(row, map, 'credit'));
  if (debit != null || credit != null) return (credit ?? 0) - Math.abs(debit ?? 0);
  return null;
}

function sheetRows(buf: Buffer, fileName: string): Row[] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: false });
  const preferred =
    wb.SheetNames.find((name) => name.toLowerCase() === 'transactions') ??
    wb.SheetNames[0];
  if (!preferred) return [];
  const sheet = wb.Sheets[preferred];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: false });
}

function periodFromRows(rows: ExtractedTxn[]): { statementPeriod: string | null; periodStart: string | null; periodEnd: string | null } {
  const dates = rows.map((r) => r.date).sort();
  const start = dates[0] ?? null;
  const end = dates.at(-1) ?? null;
  return {
    statementPeriod: start && end ? (start === end ? start : `${start} to ${end}`) : null,
    periodStart: start,
    periodEnd: end,
  };
}

export function parseSpreadsheet(buf: Buffer, fileName: string): ExtractResult {
  const rows = sheetRows(buf, fileName);
  if (rows.length === 0) return { ok: false, error: 'No spreadsheet rows found.' };

  const map = headerMap(rows[0]!);
  if (!map.has('date')) return { ok: false, error: 'No date column found.' };
  if (!map.has('source')) return { ok: false, error: 'No description, merchant, payee, or source column found.' };
  if (!map.has('amount') && !map.has('debit') && !map.has('credit')) {
    return { ok: false, error: 'No amount column found.' };
  }

  const transactions: ExtractedTxn[] = [];
  const accountCounts = new Map<string, number>();
  const accountNumberCounts = new Map<string, number>();

  for (const row of rows) {
    const date = parseDate(value(row, map, 'date'));
    const amount = parseAmount(row, map);
    const source = String(value(row, map, 'source') ?? '').trim();
    if (!date || amount == null || !source) continue;

    const balance = parseMoney(value(row, map, 'balance'));
    transactions.push({ date, source, amount, balance });

    const account = String(value(row, map, 'account') ?? '').trim();
    if (account) accountCounts.set(account, (accountCounts.get(account) ?? 0) + 1);
    const accountNumber = normalizeAccountNumber(value(row, map, 'accountNumber'));
    if (accountNumber) accountNumberCounts.set(accountNumber, (accountNumberCounts.get(accountNumber) ?? 0) + 1);
  }

  if (transactions.length === 0) return { ok: false, error: 'No importable transactions found.' };

  const account = [...accountCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fileName.replace(/\.(csv|tsv|xls|xlsx)$/i, '');
  const accountNumber = [...accountNumberCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const period = periodFromRows(transactions);

  return {
    ok: true,
    issuer: 'spreadsheet',
    type: 'bank',
    deferred: false,
    account,
    accountNumber,
    statementPeriod: period.statementPeriod,
    summary: {
      period_start: period.periodStart,
      period_end: period.periodEnd,
      beginning_balance: null,
      ending_balance: null,
      stated_credits: null,
      stated_debits: null,
    },
    transactions,
  };
}
