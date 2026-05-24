/**
 * Idempotent migration: links imports → documents so an uploaded file's rows
 * can be found/removed precisely. Set-null on document delete. Safe to re-run.
 *   npx tsx scripts/migrate-imports-document.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

const STATEMENTS = [
  `ALTER TABLE imports ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES documents(id) ON DELETE SET NULL;`,
  `CREATE INDEX IF NOT EXISTS imports_document_idx ON imports (document_id);`,
];

async function main() {
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
    console.log('  ✓', stmt.slice(0, 64));
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
