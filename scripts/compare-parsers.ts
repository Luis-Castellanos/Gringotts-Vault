// scripts/compare-parsers.ts
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { dispatch } from '@/lib/parser/dispatcher';

const execFileAsync = promisify(execFile);

// Adjust if your Python lives elsewhere
const PYTHON_CMD = process.env.PYTHON_CMD ?? 'python';
const PYTHON_WRAPPER = process.env.PYTHON_WRAPPER
  ?? resolve(__dirname, 'parse-one.py');

type NormalizedTxn = {
  date: string;
  amount: string;
  rawDescription: string;
  category: string;
  subcategory: string;
};

async function runPython(pdfPath: string, issuer?: string): Promise<NormalizedTxn[]> {
  const args = [PYTHON_WRAPPER, pdfPath];
  if (issuer) args.push('--issuer', issuer);
  const { stdout } = await execFileAsync(PYTHON_CMD, args);
  const result = JSON.parse(stdout);
  return result.transactions.map((t: any) => ({
    date: t.date,
    amount: Number(t.amount).toFixed(2),
    rawDescription: t.source,
    category: t.category,
    subcategory: t.subcategory,
  }));
}

async function runTypescript(pdfPath: string, accountNumber: string): Promise<NormalizedTxn[]> {
  const bytes = await readFile(pdfPath);
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  const { stdout: text } = await execFileAsync('pdftotext', ['-layout', pdfPath, '-']);

  // For comparison, fake a folder slug + accountsByNumber that the parser
  // can resolve. We use a sentinel UUID so that cross-checks can match
  // amount/description even though the real DB has a different ID.
  const fakeAccountId = '00000000-0000-0000-0000-000000000000';
  const parsed = dispatch(text, basename(pdfPath), {
    sourceFile: basename(pdfPath),
    fileHash,
    folderSlug: 'compare-harness',
    accountsByNumber: { [accountNumber]: fakeAccountId },
  });

  return parsed.transactions.map(t => ({
    date: t.date,
    amount: t.amount,
    rawDescription: t.rawDescription,
    category: t.category,
    subcategory: t.subcategory,
  }));
}

function keyOf(t: NormalizedTxn): string {
  return `${t.date}|${t.amount}|${t.rawDescription}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const pdfPath = resolve(argv[0]);
  const accIdx = argv.indexOf('--account');
  const accountNumber = accIdx >= 0 ? argv[accIdx + 1] : null;
  const issuerIdx = argv.indexOf('--issuer');
  const issuer = issuerIdx >= 0 ? argv[issuerIdx + 1] : undefined;

  if (!pdfPath || !accountNumber) {
    console.error(
      'Usage: tsx scripts/compare-parsers.ts <pdf> --account <last4> [--issuer <python-issuer-name>]\n' +
      'Example: tsx scripts/compare-parsers.ts ./apple-feb-2020.pdf --account 7999 --issuer apple_card',
    );
    process.exit(1);
  }

  const [py, ts] = await Promise.all([
    runPython(pdfPath, issuer),
    runTypescript(pdfPath, accountNumber),
  ]);

  const pyMap = new Map(py.map(t => [keyOf(t), t]));
  const tsMap = new Map(ts.map(t => [keyOf(t), t]));

  const onlyPy = py.filter(t => !tsMap.has(keyOf(t)));
  const onlyTs = ts.filter(t => !pyMap.has(keyOf(t)));
  const both = py.filter(t => tsMap.has(keyOf(t)));

  const catMismatch: Array<{ key: string; py: NormalizedTxn; ts: NormalizedTxn }> = [];
  for (const t of both) {
    const tsT = tsMap.get(keyOf(t))!;
    if (t.category !== tsT.category || t.subcategory !== tsT.subcategory) {
      catMismatch.push({ key: keyOf(t), py: t, ts: tsT });
    }
  }

  console.log(`\nFile:       ${basename(pdfPath)}`);
  console.log(`Account:    ${accountNumber}`);
  console.log(`Python:     ${py.length} transactions`);
  console.log(`TypeScript: ${ts.length} transactions`);
  console.log(`Match:      ${both.length}`);
  console.log(`Only in Python:     ${onlyPy.length}`);
  console.log(`Only in TypeScript: ${onlyTs.length}`);
  console.log(`Category mismatches: ${catMismatch.length}`);

  if (onlyPy.length > 0) {
    console.log('\n--- Only in Python ---');
    onlyPy.forEach(t =>
      console.log(`  ${t.date}  ${t.amount.padStart(10)}  ${t.rawDescription}`),
    );
  }
  if (onlyTs.length > 0) {
    console.log('\n--- Only in TypeScript ---');
    onlyTs.forEach(t =>
      console.log(`  ${t.date}  ${t.amount.padStart(10)}  ${t.rawDescription}`),
    );
  }
  if (catMismatch.length > 0) {
    console.log('\n--- Category mismatches ---');
    catMismatch.forEach(m => {
      console.log(`  ${m.key}`);
      console.log(`    Python:     ${m.py.category} / ${m.py.subcategory}`);
      console.log(`    TypeScript: ${m.ts.category} / ${m.ts.subcategory}`);
    });
  }

  const totalDiffs = onlyPy.length + onlyTs.length + catMismatch.length;
  if (totalDiffs === 0) console.log('\n✓ Parsers agree.');
  else console.log(`\n✗ ${totalDiffs} disagreement(s).`);

  process.exit(totalDiffs === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
