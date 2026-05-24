/**
 * Idempotent migration: creates the `documents` table (uploaded statement PDFs
 * + their parse lifecycle). The PDF is stored inline as bytea. Safe to re-run.
 *   npx tsx scripts/migrate-documents.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS documents (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     file_name text NOT NULL,
     content_hash text NOT NULL,
     mime_type text NOT NULL DEFAULT 'application/pdf',
     byte_size integer NOT NULL,
     data bytea NOT NULL,
     detected_type text NOT NULL DEFAULT 'unknown',
     detected_issuer text,
     account_ids jsonb,
     account_label text,
     statement_period text,
     status text NOT NULL DEFAULT 'uploaded',
     transaction_count integer NOT NULL DEFAULT 0,
     parse_error text,
     uploaded_at timestamptz NOT NULL DEFAULT now(),
     parsed_at timestamptz
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS documents_content_hash_unique ON documents (content_hash);`,
  `CREATE INDEX IF NOT EXISTS documents_uploaded_at_idx ON documents (uploaded_at);`,
  `CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status);`,
];

async function main() {
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
    console.log('  ✓', stmt.split('\n')[0]!.trim());
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
