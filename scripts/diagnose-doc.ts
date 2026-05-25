/**
 * Diagnose why a stored document parsed the way it did. Read-only.
 *   npx tsx scripts/diagnose-doc.ts "4763"
 */

import 'dotenv/config';
import { ilike } from 'drizzle-orm';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';

const KEYWORDS = [
  'INVESTMENT STATEMENT', 'BROKERAGE', 'J.P. MORGAN SECURITIES', 'ACCOUNT VALUE',
  'JPMORGAN CHASE', 'CHASE', 'CHECKING', 'TRANSACTION DETAIL',
  'PAYMENTS AND OTHER CREDITS', 'ACCOUNT ACTIVITY',
];

async function main() {
  const q = process.argv[2] ?? '4763';
  const rows = await db
    .select({
      id: documents.id, fileName: documents.fileName, status: documents.status,
      issuer: documents.detectedIssuer, type: documents.detectedType,
      err: documents.parseError, period: documents.statementPeriod,
      bytes: documents.byteSize, data: documents.data,
    })
    .from(documents)
    .where(ilike(documents.fileName, `%${q}%`))
    .limit(3);

  if (rows.length === 0) { console.log(`No document matching "%${q}%".`); process.exit(0); }

  for (const d of rows) {
    console.log(`\n=== ${d.fileName} ===`);
    console.log(`  status=${d.status} issuer=${d.issuer} type=${d.type}`);
    console.log(`  period=${d.period} bytes=${d.bytes}`);
    console.log(`  parseError=${d.err ?? '—'}`);

    const dir = await mkdtemp(join(tmpdir(), 'vault-diag-'));
    const pdf = join(dir, 'doc.pdf');
    await writeFile(pdf, d.data as Buffer);
    const r = spawnSync('pdftotext', ['-enc', 'UTF-8', '-layout', pdf, '-'], { encoding: 'utf-8' });
    const head = (r.stdout ?? '').slice(0, 5000).toUpperCase();
    if (!head) {
      console.log(`  (pdftotext produced no text; stderr: ${(r.stderr ?? '').slice(0, 200)})`);
    } else {
      console.log('  keyword presence in head[:5000]:');
      for (const k of KEYWORDS) console.log(`    ${head.includes(k) ? '✓' : '·'} ${k}`);
      const full = (r.stdout ?? '').toUpperCase();
      console.log(`  full-text length=${full.length}; index of TRANSACTION DETAIL=${full.indexOf('TRANSACTION DETAIL')}, CHECKING=${full.indexOf('CHECKING')}, CHECKING SUMMARY=${full.indexOf('CHECKING SUMMARY')}`);
      // Force the chase_checking parser on the text to see if the FORMAT parses
      // (independent of detection), plus the summary extraction.
      const txt = join(dir, 'doc.txt');
      await writeFile(txt, r.stdout ?? '', 'utf-8');
      const py = `import sys; sys.path.insert(0,'parser')
from parse_statements import parse_chase_checking, extract_statement_summary, detect_issuer
t=open(sys.argv[1],encoding='utf-8').read()
print('  detect_issuer ->', detect_issuer(t))
try:
    txns,stmt=parse_chase_checking(t)
    print('  forced parse_chase_checking -> txns=%d period=%s' % (len(txns), stmt))
    print('  summary:', extract_statement_summary(t,'chase_checking',stmt))
    if txns: print('  first:', txns[0]['date'], txns[0]['amount'], 'last:', txns[-1]['date'], txns[-1]['amount'], 'bal=', txns[-1].get('balance'))
except Exception as e:
    print('  forced parse FAILED:', type(e).__name__, e)
print('  --- TRANSACTION DETAIL date-lines (OK = captured by the txn regex) ---')
import re as _re
line_re = _re.compile(r"^\s*(\d{2}/\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$")
date_re = _re.compile(r"^\s*\d{2}/\d{2}\b")
in_detail = False
for ln in t.splitlines():
    s = ln.strip()
    if 'TRANSACTION DETAIL' in s.upper():
        in_detail = True
    if not in_detail:
        continue
    if date_re.match(ln):
        print(('  OK  ' if line_re.match(ln) else '  DROP') + repr(ln.rstrip()[:140]))`;
      const p = spawnSync('python', ['-c', py, txt], { encoding: 'utf-8' });
      process.stdout.write((p.stdout ?? '') + ((p.stderr && p.stderr.trim()) ? '  pyerr: ' + p.stderr.slice(0, 300) : ''));
    }
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
