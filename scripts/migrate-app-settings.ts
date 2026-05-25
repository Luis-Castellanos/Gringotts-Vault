/**
 * Idempotent migration: creates the app_settings key/value table.
 *   npx tsx scripts/migrate-app-settings.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

async function main() {
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS app_settings (
       key text PRIMARY KEY,
       value text,
       updated_at timestamptz NOT NULL DEFAULT now()
     );`),
  );
  console.log('  ✓ app_settings');
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
